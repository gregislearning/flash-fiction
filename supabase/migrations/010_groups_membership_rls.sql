-- 010_groups_membership_rls.sql — Groups feature, PR2 (membership + roles + RLS)
--
-- This is the tenant WRITE boundary. PR1 (009) made groups real for routing and
-- added prompts.group_id (read side). PR2 adds membership, roles, the helper
-- functions, and rewrites every WRITE-path policy so participation is gated by
-- group membership derived from prompt_id. SELECT policies stay public-read and
-- are deliberately left untouched (public groups: anyone can view).
--
-- The whole script is wrapped in BEGIN/COMMIT so a mid-script failure (especially
-- the drop-and-recreate of policies) rolls back cleanly and never leaves the live
-- app with policies dropped (default-deny) or half-applied.
--
-- Tenancy model (locked in scope): prompts.group_id is the single source of
-- tenancy. submissions/votes/comments carry NO group_id — their group is derived
-- from prompt_id inside the write policies. A client-writable group_id would be
-- spoofable on INSERT; deriving from prompt_id closes the cross-tenant write hole.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- group_members
--   role: 'admin' manages prompts/invites within the group; 'member' participates.
--   Writes are LOCKED in PR2 (no INSERT/UPDATE/DELETE policy → default-deny).
--   The backfill below runs as the migration owner (bypasses RLS). Runtime
--   membership inserts arrive in PR3 via a SECURITY DEFINER accept function.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE group_members (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_group_members_user_id ON group_members(user_id);

ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- A user can see their own membership rows (powers the group switcher and the
-- app-layer requireMembership/requireGroupAdmin checks). Admin-views-all-members
-- lands in PR3 with the admin UI.
CREATE POLICY "Users can view their own memberships"
  ON group_members FOR SELECT
  USING (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- group_invitations  (table created now; invite/accept UI + policies land PR3)
--   Invitee may not have an account yet, so this keys on email, not user_id.
--   RLS enabled with NO policies in PR2 → fully locked (definer/service only).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE group_invitations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  token       UUID NOT NULL DEFAULT gen_random_uuid(),
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One outstanding (unaccepted) invite per (group, email). Accepted rows are
-- exempt so a re-invite after acceptance is possible.
CREATE UNIQUE INDEX idx_group_invitations_open_unique
  ON group_invitations(group_id, email)
  WHERE accepted_at IS NULL;

CREATE INDEX idx_group_invitations_email ON group_invitations(email);
CREATE INDEX idx_group_invitations_token ON group_invitations(token);

ALTER TABLE group_invitations ENABLE ROW LEVEL SECURITY;
-- (No policies in PR2 — default-deny. PR3 adds admin-manage + invitee-by-token.)

-- ─────────────────────────────────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER — mirror get_user_vote_count_for_prompt).
-- Definer context bypasses RLS on group_members, avoiding policy recursion when
-- these are called from inside other tables' policies.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_group_member(g UUID, u UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g AND gm.user_id = u
  );
$$;

-- True if the user is a group admin of g, OR a site-wide super-admin.
CREATE OR REPLACE FUNCTION is_group_admin(g UUID, u UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g AND gm.user_id = u AND gm.role = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = u
      AND (au.raw_user_meta_data->>'is_admin')::boolean = true
  );
$$;

-- App layer calls these via supabase.rpc(...) for guard checks.
GRANT EXECUTE ON FUNCTION is_group_member(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION is_group_admin(UUID, UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Backfill membership: every existing user → member of the default group;
-- every super-admin (is_admin = true) → role 'admin' in the default group.
-- Runs as the migration owner, so group_members RLS does not block it.
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO group_members (group_id, user_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001',
  au.id,
  CASE WHEN (au.raw_user_meta_data->>'is_admin')::boolean = true
       THEN 'admin' ELSE 'member' END
FROM auth.users au
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- notifications.group_id — server-set (never client-supplied → not spoofable).
-- Backfill from the linked submission's prompt, then SET NOT NULL.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE notifications
  ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

UPDATE notifications n
SET group_id = p.group_id
FROM submissions s
JOIN prompts p ON p.id = s.prompt_id
WHERE s.id = n.submission_id
  AND n.group_id IS NULL;

ALTER TABLE notifications
  ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX idx_notifications_group_id ON notifications(group_id);

-- The comment-notification trigger now stamps group_id on the notification it
-- creates (derived from the submission's prompt). Recreate the function with the
-- group_id wired in; the rest of the dedup/replace logic is unchanged.
CREATE OR REPLACE FUNCTION public.notify_submission_comment_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submission_owner UUID;
  notif_group_id UUID;
  preview TEXT;
  notification_message TEXT;
BEGIN
  -- Find the submission author (recipient) and the tenancy group, in one shot.
  SELECT s.user_id, p.group_id
    INTO submission_owner, notif_group_id
  FROM submissions s
  JOIN prompts p ON p.id = s.prompt_id
  WHERE s.id = NEW.submission_id;

  IF submission_owner IS NULL THEN
    RETURN NEW;
  END IF;

  -- Do not notify the commenter about their own comment.
  IF submission_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  preview := LEFT(NEW.content, 200);
  notification_message := 'New comment on your submission';

  -- Replace the existing unread notification (if any).
  UPDATE notifications n
  SET
    comment_id = NEW.id,
    comment_preview = preview,
    message = notification_message,
    unread = true,
    created_at = NOW(),
    read_at = NULL
  WHERE n.user_id = submission_owner
    AND n.submission_id = NEW.submission_id
    AND n.unread = true;

  IF FOUND THEN
    RETURN NEW;
  END IF;

  -- Otherwise insert a fresh one. Recover from the unique index under races.
  BEGIN
    INSERT INTO notifications (
      user_id, submission_id, comment_id, group_id,
      message, comment_preview, unread, created_at, read_at
    ) VALUES (
      submission_owner, NEW.submission_id, NEW.id, notif_group_id,
      notification_message, preview, true, NOW(), NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE notifications n
      SET
        comment_id = NEW.id,
        comment_preview = preview,
        message = notification_message,
        unread = true,
        created_at = NOW(),
        read_at = NULL
      WHERE n.user_id = submission_owner
        AND n.submission_id = NEW.submission_id
        AND n.unread = true;
  END;

  RETURN NEW;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════
-- RLS REWRITE — WRITE PATHS ONLY. SELECT policies are intentionally NOT touched
-- (public-read groups). Each write policy keeps its existing own-row + phase
-- rules and ANDs on prompt-derived membership.
-- ═════════════════════════════════════════════════════════════════════════

-- ── prompts: admin writes → group admin (or super-admin) of the prompt's group ──
DROP POLICY "Admins can create prompts" ON prompts;
CREATE POLICY "Group admins can create prompts"
  ON prompts FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND is_group_admin(group_id, auth.uid())
  );

DROP POLICY "Admins can update prompts" ON prompts;
CREATE POLICY "Group admins can update prompts"
  ON prompts FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND is_group_admin(group_id, auth.uid())
  );

DROP POLICY "Admins can delete prompts" ON prompts;
CREATE POLICY "Group admins can delete prompts"
  ON prompts FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND is_group_admin(group_id, auth.uid())
  );

-- ── submissions: own-row + writing-phase + prompt-derived membership ──
DROP POLICY "Authenticated users can create submissions during writing phase" ON submissions;
CREATE POLICY "Members can create submissions during writing phase"
  ON submissions FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = prompt_id
        AND NOW() >= prompts.submission_start
        AND NOW() < prompts.submission_end
    )
    -- Membership group is derived from the SAME prompt_id as the phase check,
    -- so a member of A cannot tag a row into B (the spoof case).
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = prompt_id),
      auth.uid()
    )
  );

DROP POLICY "Users can update their own submissions during writing phase" ON submissions;
CREATE POLICY "Members can update their own submissions during writing phase"
  ON submissions FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = prompt_id
        AND NOW() >= submission_start
        AND NOW() < submission_end
    )
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = submissions.prompt_id),
      auth.uid()
    )
  );

DROP POLICY "Users can claim own submissions after voting ends" ON submissions;
CREATE POLICY "Members can claim own submissions after voting ends"
  ON submissions FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = submissions.prompt_id
        AND NOW() >= prompts.voting_end
    )
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = submissions.prompt_id),
      auth.uid()
    )
  );

DROP POLICY "Users can delete their own submissions during writing phase" ON submissions;
CREATE POLICY "Members can delete their own submissions during writing phase"
  ON submissions FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = prompt_id
        AND NOW() >= submission_start
        AND NOW() < submission_end
    )
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = submissions.prompt_id),
      auth.uid()
    )
  );

-- ── votes: 2-vote cap + no-self-vote + phase + prompt-derived membership ──
DROP POLICY "Authenticated users can vote for up to 2 submissions" ON votes;
CREATE POLICY "Members can vote for up to 2 submissions"
  ON votes FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = prompt_id
        AND NOW() >= prompts.submission_end
        AND NOW() < prompts.voting_end
    )
    AND NOT EXISTS (
      SELECT 1 FROM submissions
      WHERE submissions.id = submission_id
        AND submissions.user_id = auth.uid()
    )
    AND get_user_vote_count_for_prompt(prompt_id, auth.uid()) < 2
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = prompt_id),
      auth.uid()
    )
  );

DROP POLICY "Users can delete their vote during voting phase" ON votes;
CREATE POLICY "Members can delete their vote during voting phase"
  ON votes FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prompts
      WHERE prompts.id = prompt_id
        AND NOW() >= submission_end
        AND NOW() < voting_end
    )
    AND is_group_member(
      (SELECT group_id FROM prompts WHERE id = votes.prompt_id),
      auth.uid()
    )
  );

-- ── submission_comments: post-voting + prompt-derived membership ──
-- Membership is derived via the comment's submission → prompt → group_id.
DROP POLICY "Authenticated users can comment after voting ends" ON submission_comments;
CREATE POLICY "Members can comment after voting ends"
  ON submission_comments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM submissions
      JOIN prompts ON prompts.id = submissions.prompt_id
      WHERE submissions.id = submission_id
        AND NOW() >= prompts.voting_end
    )
    AND is_group_member(
      (SELECT p.group_id
         FROM submissions s
         JOIN prompts p ON p.id = s.prompt_id
        WHERE s.id = submission_id),
      auth.uid()
    )
  );

DROP POLICY "Users can update their own comments" ON submission_comments;
CREATE POLICY "Members can update their own comments"
  ON submission_comments FOR UPDATE
  USING (
    user_id = auth.uid()
    AND is_group_member(
      (SELECT p.group_id
         FROM submissions s
         JOIN prompts p ON p.id = s.prompt_id
        WHERE s.id = submission_comments.submission_id),
      auth.uid()
    )
  );

DROP POLICY "Users can delete their own comments" ON submission_comments;
CREATE POLICY "Members can delete their own comments"
  ON submission_comments FOR DELETE
  USING (
    user_id = auth.uid()
    AND is_group_member(
      (SELECT p.group_id
         FROM submissions s
         JOIN prompts p ON p.id = s.prompt_id
        WHERE s.id = submission_comments.submission_id),
      auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- search_submissions — add a group_id arg so results scope to the viewed group.
-- Signature changes (new param), so drop the old function first. Everything else
-- (SECURITY INVOKER so RLS applies; the submission_end phase filter) is unchanged.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS search_submissions(text, int);

CREATE OR REPLACE FUNCTION search_submissions(p_group_id uuid, q text, lim int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  prompt_id uuid,
  prompt_title text,
  prompt_phase text,
  snippet text,
  rank real,
  claimed boolean,
  author_email text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT
    s.id,
    s.prompt_id,
    p.title AS prompt_title,
    CASE WHEN now() >= p.voting_end THEN 'results' ELSE 'voting' END AS prompt_phase,
    ts_headline(
      'english',
      s.content,
      websearch_to_tsquery('english', q),
      'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=8'
    ) AS snippet,
    ts_rank(s.search_tsv, websearch_to_tsquery('english', q)) AS rank,
    s.claimed,
    s.author_email,
    s.created_at
  FROM submissions s
  JOIN prompts p ON p.id = s.prompt_id
  WHERE s.search_tsv @@ websearch_to_tsquery('english', q)
    AND p.group_id = p_group_id
    AND now() >= p.submission_end
  ORDER BY rank DESC, s.created_at DESC
  LIMIT GREATEST(1, LEAST(lim, 100));
$$;

GRANT EXECUTE ON FUNCTION search_submissions(uuid, text, int) TO anon, authenticated;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION VERIFICATION (run manually after applying; all should pass)
-- ═════════════════════════════════════════════════════════════════════════
-- -- Every existing user landed in the default group:
-- SELECT count(*) AS users_not_in_default
--   FROM auth.users au
--   WHERE NOT EXISTS (
--     SELECT 1 FROM group_members gm
--     WHERE gm.user_id = au.id
--       AND gm.group_id = '00000000-0000-0000-0000-000000000001'
--   );                                                          -- expect 0
--
-- -- Prior super-admins are group admins:
-- SELECT count(*) AS superadmins_not_group_admin
--   FROM auth.users au
--   WHERE (au.raw_user_meta_data->>'is_admin')::boolean = true
--     AND NOT EXISTS (
--       SELECT 1 FROM group_members gm
--       WHERE gm.user_id = au.id AND gm.role = 'admin'
--     );                                                        -- expect 0
--
-- -- No notification without a group:
-- SELECT count(*) AS notifications_without_group
--   FROM notifications WHERE group_id IS NULL;                  -- expect 0
--
-- ── MANUAL SPOOF CHECK (the #1 leak this PR closes) ──
-- Until the pgTAP suite lands, sanity-check the spoof by hand. As a user who is a
-- member of group A but NOT group B, attempt to insert a submission referencing
-- one of group B's OPEN prompt_ids. It MUST be rejected by RLS:
--
-- -- (run while authenticated as the group-A member, e.g. via the app's session
-- --  or `SET request.jwt.claims` in a test harness)
-- INSERT INTO submissions (prompt_id, user_id, content, word_count)
-- VALUES ('<group_B_open_prompt_id>', auth.uid(), 'spoof attempt', 2);
-- -- expect: ERROR / new row violates row-level security policy
