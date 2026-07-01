-- 011_groups_invites_admin.sql — Groups PR3: invite/accept + super-admin group
-- creation, the membership WRITE path PR2 deliberately left out.
--
-- PR2 created group_members (SELECT-own only) and group_invitations (RLS on, NO
-- policies → fully locked) and noted: "membership inserts arrive in PR3 via a
-- SECURITY DEFINER accept function." This migration lands that, plus:
--   - create_group(): super-admin creates a group + names its first admin
--     (existing user → member row; not-yet-registered → admin invitation).
--   - accept_invitation(): verified-email-gated, idempotent membership insert.
--   - get_invitation_by_token(): lets the accept page render invite details
--     without exposing group_invitations via a broad SELECT policy.
--   - group_invitations policies: group admins manage their own group's invites.
--
-- All inserts that RLS would otherwise block run inside SECURITY DEFINER
-- functions that re-check authorization explicitly (definer context bypasses
-- RLS, so the gate must live in the function body). Mirrors the is_group_admin
-- pattern from 010. BEGIN/COMMIT-wrapped so a mid-script failure rolls back
-- cleanly rather than leaving half-applied policies.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Super-admin predicate (site-wide is_admin), DRYs the check create_group and
-- future cross-group admin paths need. Mirrors is_group_admin's super-admin arm.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_super_admin(u UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = u
      AND (au.raw_user_meta_data->>'is_admin')::boolean = true
  );
$$;

GRANT EXECUTE ON FUNCTION is_super_admin(UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- create_group — super-admin only. Creates the group and assigns its first
-- admin by email: if that email already has an account, insert an admin
-- membership row directly; otherwise create an admin-role invitation they
-- claim via the /invite/[token] flow. Returns the slug and, when an invitation
-- was created, the token so the caller can surface the copy/paste link.
--
-- SECURITY DEFINER (no INSERT policy on groups/group_members for the caller),
-- so authorization is enforced in-body: non-super-admins get rejected.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_group(
  p_name        TEXT,
  p_slug        TEXT,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_group_id     UUID;
  v_slug         TEXT := lower(trim(p_slug));
  v_name         TEXT := trim(p_name);
  v_admin_email  TEXT := lower(trim(p_admin_email));
  v_admin_user   UUID;
  v_token        UUID;
BEGIN
  IF v_caller IS NULL OR NOT is_super_admin(v_caller) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'group name is required' USING ERRCODE = '22023';
  END IF;

  -- Slug is the public, immutable URL segment: lowercase kebab, 1+ chars.
  IF v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'invalid slug: use lowercase letters, numbers, and hyphens'
      USING ERRCODE = '22023';
  END IF;

  IF v_admin_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'invalid admin email' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO groups (name, slug, listed, created_by)
    VALUES (v_name, v_slug, true, v_caller)
    RETURNING id INTO v_group_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slug "%" is already taken', v_slug USING ERRCODE = '23505';
  END;

  SELECT id INTO v_admin_user FROM auth.users WHERE lower(email) = v_admin_email;

  IF v_admin_user IS NOT NULL THEN
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (v_group_id, v_admin_user, 'admin')
    ON CONFLICT (group_id, user_id) DO UPDATE SET role = 'admin';
  ELSE
    INSERT INTO group_invitations (group_id, email, role, invited_by)
    VALUES (v_group_id, v_admin_email, 'admin', v_caller)
    RETURNING token INTO v_token;
  END IF;

  RETURN jsonb_build_object(
    'group_id', v_group_id,
    'slug', v_slug,
    'admin_invite_token', v_token  -- null when the admin already had an account
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_group(TEXT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- get_invitation_by_token — read-only invite details for the accept page.
-- Lets a (possibly logged-out) invitee see "you've been invited to {group}"
-- without a public SELECT policy on group_invitations. Returns NULL when the
-- token is unknown. `accepted` lets the page distinguish a used link.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_invitation_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'group_name', g.name,
    'group_slug', g.slug,
    'email', gi.email,
    'role', gi.role,
    'accepted', gi.accepted_at IS NOT NULL
  )
  FROM group_invitations gi
  JOIN groups g ON g.id = gi.group_id
  WHERE gi.token = p_token;
$$;

GRANT EXECUTE ON FUNCTION get_invitation_by_token(UUID) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- accept_invitation — the membership write path. Joins the current user to the
-- invited group, gated by:
--   * signed in,
--   * email VERIFIED (email_confirmed_at) — blocks signing up as victim@… to
--     absorb their invite (membership account-takeover),
--   * the verified email MATCHES the invite's email.
-- Idempotent: ON CONFLICT DO NOTHING on the (group_id, user_id) PK + defensive
-- accepted_at stamp, so a double-accept (callback race + button) can't 500.
-- Returns the group slug/name for the post-accept redirect.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user       UUID := auth.uid();
  v_email      TEXT;
  v_verified   TIMESTAMPTZ;
  v_invite     group_invitations%ROWTYPE;
  v_slug       TEXT;
  v_name       TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'must be signed in to accept an invitation'
      USING ERRCODE = '42501';
  END IF;

  SELECT lower(email), email_confirmed_at
    INTO v_email, v_verified
    FROM auth.users WHERE id = v_user;

  IF v_verified IS NULL THEN
    RAISE EXCEPTION 'verify your email before accepting an invitation'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_invite
    FROM group_invitations
    WHERE token = p_token AND accepted_at IS NULL
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found or already accepted'
      USING ERRCODE = 'P0002';
  END IF;

  IF lower(v_invite.email) <> v_email THEN
    RAISE EXCEPTION 'this invitation is for a different email address'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO group_members (group_id, user_id, role)
  VALUES (v_invite.group_id, v_user, v_invite.role)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  UPDATE group_invitations SET accepted_at = NOW() WHERE id = v_invite.id;

  SELECT slug, name INTO v_slug, v_name FROM groups WHERE id = v_invite.group_id;

  RETURN jsonb_build_object('group_slug', v_slug, 'group_name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION accept_invitation(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- my_pending_invitations — invites awaiting the CURRENT user (verified email),
-- powering the empty-state "Accept invitation to {group}" button. Invitees
-- aren't group admins, so they can't SELECT group_invitations directly; this
-- definer function is their only window, scoped to their own verified email.
-- Returns no rows for an unverified email (nothing to safely surface yet).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION my_pending_invitations()
RETURNS TABLE (token UUID, group_name TEXT, group_slug TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gi.token, g.name, g.slug, gi.role
  FROM group_invitations gi
  JOIN groups g ON g.id = gi.group_id
  JOIN auth.users au ON au.id = auth.uid()
  WHERE gi.accepted_at IS NULL
    AND au.email_confirmed_at IS NOT NULL
    AND lower(gi.email) = lower(au.email);
$$;

GRANT EXECUTE ON FUNCTION my_pending_invitations() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- claim_my_invitations — belt-and-suspenders bulk auto-claim called from the
-- auth callback after sign-in/verification. Joins the current verified user to
-- every group they have an open invite for. Idempotent (ON CONFLICT DO NOTHING
-- + accepted_at stamp) so the callback racing the empty-state button is safe.
-- No-ops (returns 0) for an unverified email. Returns the count claimed.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_my_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user     UUID := auth.uid();
  v_email    TEXT;
  v_verified TIMESTAMPTZ;
  v_count    INTEGER := 0;
  v_invite   RECORD;
BEGIN
  IF v_user IS NULL THEN RETURN 0; END IF;

  SELECT lower(email), email_confirmed_at INTO v_email, v_verified
    FROM auth.users WHERE id = v_user;

  IF v_verified IS NULL THEN RETURN 0; END IF;

  FOR v_invite IN
    SELECT * FROM group_invitations
    WHERE accepted_at IS NULL AND lower(email) = v_email
    FOR UPDATE
  LOOP
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (v_invite.group_id, v_user, v_invite.role)
    ON CONFLICT (group_id, user_id) DO NOTHING;

    UPDATE group_invitations SET accepted_at = NOW() WHERE id = v_invite.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_my_invitations() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- group_invitations policies — group admins manage their own group's invites
-- (the invite-by-email UI inserts/lists/revokes via the authenticated role).
-- Acceptance does NOT go through these: invitees aren't admins and reach the
-- table only via accept_invitation() / get_invitation_by_token() (definer).
-- ─────────────────────────────────────────────────────────────────────────
CREATE POLICY "Group admins can view their group's invitations"
  ON group_invitations FOR SELECT
  TO authenticated
  USING (is_group_admin(group_id, auth.uid()));

CREATE POLICY "Group admins can create invitations"
  ON group_invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    is_group_admin(group_id, auth.uid())
    AND invited_by = auth.uid()
  );

CREATE POLICY "Group admins can revoke invitations"
  ON group_invitations FOR DELETE
  TO authenticated
  USING (is_group_admin(group_id, auth.uid()));

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════
-- POST-MIGRATION VERIFICATION (run manually after applying)
-- ═════════════════════════════════════════════════════════════════════════
-- -- create_group rejects a non-super-admin (run as a normal authenticated user):
-- --   SELECT create_group('X','x','a@b.com');  -- expect ERROR: not authorized
-- --
-- -- accept_invitation rejects an email mismatch / unverified email / bad token:
-- --   SELECT accept_invitation('<token>');      -- expect ERROR per the gate hit
-- --
-- -- get_invitation_by_token returns details for a valid token, NULL otherwise.
