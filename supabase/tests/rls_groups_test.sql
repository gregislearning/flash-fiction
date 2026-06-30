-- rls_groups_test.sql — pgTAP suite for the Groups tenant-isolation boundary.
--
-- This is the gate the scope requires for PR2: it proves the prompt-derived
-- membership write policies (migration 010) actually fail-closed, including the
-- #1 leak — a member of group A inserting a row that references group B's
-- open prompt_id (the spoof case). Run with:  supabase test db
--
-- Strategy: seed two groups (A, B) and a user matrix {member, admin, non-member,
-- super-admin, anon}, then switch Postgres role + request.jwt.claims to act as
-- each principal and assert SELECT/INSERT behavior. All inside one transaction
-- that ROLLBACKs, so it never touches real data.

BEGIN;
SELECT plan(19);

-- ── Baseline table privileges (reproduce the Supabase grant baseline) ──
-- A fresh `supabase db reset` of these migrations leaves anon/authenticated
-- with only Dxtm on public tables (no SELECT/INSERT/UPDATE/DELETE), so RLS
-- never gets exercised — every query fails on a base-privilege error first.
-- Grant the DML baseline here (rolled back with the test transaction) so this
-- suite actually tests the RLS *policies*, the way the hosted platform does.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Fixed UUIDs (readable suffixes: a=group A, b=group B, users by role)
-- ─────────────────────────────────────────────────────────────────────────
-- groups:   A = ...000a   B = ...000b
-- users:    memberA ...a1  adminA ...a2  memberB ...b1  memberB2 ...b2
--           nonMember ...c1  superAdmin ...d1
-- prompts:  A_open ...a01  A_voting ...a02  B_open ...b01  B_voting ...b02
--           B_results ...b03
-- subs:     A_open(adminA) ...51  B_open(memberB) ...52  B_voting(memberB) ...53
--           B_results(memberB2) ...54

-- ── Seed as the superuser (RLS bypassed for setup) ──
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'memberA@test.dev',  '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000a2', 'adminA@test.dev',   '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b1', 'memberB@test.dev',  '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000b2', 'memberB2@test.dev', '{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c1', 'nonmember@test.dev','{}'::jsonb),
  ('00000000-0000-0000-0000-0000000000d1', 'super@test.dev',    '{"is_admin":true}'::jsonb);

INSERT INTO groups (id, name, slug, listed) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'Group A', 'group-a', true),
  ('00000000-0000-0000-0000-00000000000b', 'Group B', 'group-b', true);

INSERT INTO group_members (group_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'member'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1', 'member'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b2', 'member');
-- nonMember (c1) and superAdmin (d1) are intentionally in no group.

-- Prompts. Phases via timestamps relative to now().
INSERT INTO prompts (id, group_id, title, description, word_limit, submission_start, submission_end, voting_end) VALUES
  -- A: writing phase (open for submissions)
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-00000000000a',
   'A open', 'd', 300, now() - interval '1h', now() + interval '1h', now() + interval '2h'),
  -- A: voting phase
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-00000000000a',
   'A voting', 'd', 300, now() - interval '3h', now() - interval '1h', now() + interval '1h'),
  -- B: writing phase
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-00000000000b',
   'B open', 'd', 300, now() - interval '1h', now() + interval '1h', now() + interval '2h'),
  -- B: voting phase
  ('00000000-0000-0000-0000-000000000b02', '00000000-0000-0000-0000-00000000000b',
   'B voting', 'd', 300, now() - interval '3h', now() - interval '1h', now() + interval '1h'),
  -- B: results phase (voting ended)
  ('00000000-0000-0000-0000-000000000b03', '00000000-0000-0000-0000-00000000000b',
   'B results', 'd', 300, now() - interval '5h', now() - interval '3h', now() - interval '1h');

INSERT INTO submissions (id, prompt_id, user_id, content, word_count) VALUES
  -- A writing-phase content (authored by adminA so memberA can still insert later)
  ('00000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000a01',
   '00000000-0000-0000-0000-0000000000a2', 'alpha writing only', 3),
  -- B writing-phase content (must stay hidden cross-tenant + from search)
  ('00000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000b01',
   '00000000-0000-0000-0000-0000000000b1', 'bravo wipsecret hidden', 3),
  -- B revealed (voting phase → public-read), distinctive search term zebraqux
  ('00000000-0000-0000-0000-000000000053', '00000000-0000-0000-0000-000000000b02',
   '00000000-0000-0000-0000-0000000000b1', 'bravo zebraqux revealed', 3),
  -- B results-phase content authored by memberB2 (so memberB can comment on it)
  ('00000000-0000-0000-0000-000000000054', '00000000-0000-0000-0000-000000000b03',
   '00000000-0000-0000-0000-0000000000b2', 'bravo results piece', 3);

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: act as a given user (authenticated role + jwt sub), or as anon.
-- ─────────────────────────────────────────────────────────────────────────
-- (Inlined via SET ROLE + set_config below — no function needed.)

-- ===========================================================================
-- SELECT visibility (public-read + phase gate)
-- ===========================================================================

-- anon context
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*) FROM submissions WHERE id = '00000000-0000-0000-0000-000000000052'),
  0::bigint,
  'anon cannot see B writing-phase submission'
);
SELECT is(
  (SELECT count(*) FROM submissions WHERE id = '00000000-0000-0000-0000-000000000053'),
  1::bigint,
  'anon can see B revealed (voting-phase) submission'
);
SELECT is(
  (SELECT count(*) FROM submissions WHERE id = '00000000-0000-0000-0000-000000000051'),
  0::bigint,
  'anon cannot see A writing-phase submission'
);

-- memberA context
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);

SELECT is(
  (SELECT count(*) FROM submissions WHERE id = '00000000-0000-0000-0000-000000000053'),
  1::bigint,
  'member of A CAN see B revealed submission (public-read)'
);
SELECT is(
  (SELECT count(*) FROM submissions WHERE id = '00000000-0000-0000-0000-000000000052'),
  0::bigint,
  'member of A CANNOT see B writing-phase submission'
);

-- ===========================================================================
-- INSERT write boundary (the heart of the suite)
-- ===========================================================================

-- THE SPOOF: memberA inserts a submission referencing B's OPEN prompt_id.
-- Phase check passes (B_open is in writing phase); only membership rejects it.
SELECT throws_ok(
  $$INSERT INTO submissions (prompt_id, user_id, content, word_count)
    VALUES ('00000000-0000-0000-0000-000000000b01',
            '00000000-0000-0000-0000-0000000000a1', 'spoof into B', 3)$$,
  '42501', NULL,
  'SPOOF: member of A cannot INSERT a submission into group B''s open prompt'
);

-- Positive control: memberA inserts into A's open prompt (member, writing phase).
SELECT lives_ok(
  $$INSERT INTO submissions (prompt_id, user_id, content, word_count)
    VALUES ('00000000-0000-0000-0000-000000000a01',
            '00000000-0000-0000-0000-0000000000a1', 'legit A submission', 3)$$,
  'member of A CAN INSERT a submission into group A''s open prompt'
);

-- Non-member cannot write into any group.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1"}', true);
SELECT throws_ok(
  $$INSERT INTO submissions (prompt_id, user_id, content, word_count)
    VALUES ('00000000-0000-0000-0000-000000000a01',
            '00000000-0000-0000-0000-0000000000c1', 'nonmember tries A', 3)$$,
  '42501', NULL,
  'non-member cannot INSERT a submission into group A'
);

-- Votes: memberA cross-tenant vote on a B submission during B's voting phase.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
SELECT throws_ok(
  $$INSERT INTO votes (prompt_id, submission_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000000b02',
            '00000000-0000-0000-0000-000000000053',
            '00000000-0000-0000-0000-0000000000a1')$$,
  '42501', NULL,
  'member of A cannot vote on a group B submission'
);

-- Votes positive control: memberB2 votes on B's voting submission (not own).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2"}', true);
SELECT lives_ok(
  $$INSERT INTO votes (prompt_id, submission_id, user_id)
    VALUES ('00000000-0000-0000-0000-000000000b02',
            '00000000-0000-0000-0000-000000000053',
            '00000000-0000-0000-0000-0000000000b2')$$,
  'member of B CAN vote on a group B submission'
);

-- Comments: memberA cannot comment on a B (results-phase) submission.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
SELECT throws_ok(
  $$INSERT INTO submission_comments (submission_id, user_id, author_email, content)
    VALUES ('00000000-0000-0000-0000-000000000054',
            '00000000-0000-0000-0000-0000000000a1', 'memberA@test.dev', 'cross-tenant comment')$$,
  '42501', NULL,
  'member of A cannot comment on a group B submission'
);

-- Comments positive control: memberB comments on a B submission after voting ends.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1"}', true);
SELECT lives_ok(
  $$INSERT INTO submission_comments (submission_id, user_id, author_email, content)
    VALUES ('00000000-0000-0000-0000-000000000054',
            '00000000-0000-0000-0000-0000000000b1', 'memberB@test.dev', 'nice piece')$$,
  'member of B CAN comment on a group B submission after voting ends'
);

-- ===========================================================================
-- Prompt management: group admin scope vs super-admin
-- ===========================================================================

-- adminA creates a prompt in group A → allowed.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2"}', true);
SELECT lives_ok(
  $$INSERT INTO prompts (group_id, title, description, word_limit, submission_start, submission_end, voting_end)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'admin A new', 'd', 300,
            now(), now() + interval '1h', now() + interval '2h')$$,
  'group admin of A CAN create a prompt in group A'
);

-- adminA creates a prompt in group B → rejected (not admin of B).
SELECT throws_ok(
  $$INSERT INTO prompts (group_id, title, description, word_limit, submission_start, submission_end, voting_end)
    VALUES ('00000000-0000-0000-0000-00000000000b', 'admin A into B', 'd', 300,
            now(), now() + interval '1h', now() + interval '2h')$$,
  '42501', NULL,
  'group admin of A CANNOT create a prompt in group B'
);

-- super-admin creates a prompt in group B → allowed (manages any group).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1"}', true);
SELECT lives_ok(
  $$INSERT INTO prompts (group_id, title, description, word_limit, submission_start, submission_end, voting_end)
    VALUES ('00000000-0000-0000-0000-00000000000b', 'super into B', 'd', 300,
            now(), now() + interval '1h', now() + interval '2h')$$,
  'super-admin CAN create a prompt in any group'
);

-- plain member (not admin) cannot create prompts.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', true);
SELECT throws_ok(
  $$INSERT INTO prompts (group_id, title, description, word_limit, submission_start, submission_end, voting_end)
    VALUES ('00000000-0000-0000-0000-00000000000a', 'member tries prompt', 'd', 300,
            now(), now() + interval '1h', now() + interval '2h')$$,
  '42501', NULL,
  'plain member of A cannot create a prompt'
);

-- ===========================================================================
-- search_submissions(group_id, q) — scoped + writing-phase safe
-- ===========================================================================
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '', true);

SELECT is(
  (SELECT count(*) FROM search_submissions('00000000-0000-0000-0000-00000000000a', 'zebraqux')),
  0::bigint,
  'search scoped to A does not return group B content'
);
SELECT ok(
  (SELECT count(*) FROM search_submissions('00000000-0000-0000-0000-00000000000b', 'zebraqux')) >= 1,
  'search scoped to B returns B revealed content'
);
SELECT is(
  (SELECT count(*) FROM search_submissions('00000000-0000-0000-0000-00000000000b', 'wipsecret')),
  0::bigint,
  'search never returns writing-phase content'
);

SELECT * FROM finish();
ROLLBACK;
