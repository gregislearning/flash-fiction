-- 009_groups.sql — Groups feature, PR1 (routing + tenancy column only)
--
-- Introduces the `groups` table and a `group_id` tenancy column on `prompts`.
-- This PR is STRUCTURAL: it does NOT add membership, roles, invitations, or
-- membership-gated RLS (that lands in PR2). Existing data migrates into one
-- default group; reads stay public exactly as before.
--
-- Wrapped in a single transaction so a mid-script failure rolls back cleanly
-- and never leaves the live app with a half-applied schema.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- groups
--   slug    : IMMUTABLE after creation — the public, shareable /g/[slug] URL.
--   listed  : controls visibility in the public `/` directory (load-bearing,
--             so a group can be public-read-by-link without being advertised).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  listed      BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Public-read by default. Writes (create/manage groups) are super-admin-only
-- and land in PR2/PR3; for now groups are seeded here.
CREATE POLICY "Anyone can view groups"
  ON groups FOR SELECT
  USING (true);

-- Default group. Fixed id so the prompts backfill below is deterministic and
-- re-runnable against a fresh reset.
INSERT INTO groups (id, name, slug, listed)
VALUES ('00000000-0000-0000-0000-000000000001', 'Flash Fiction', 'flash-fiction', true);

-- ─────────────────────────────────────────────────────────────────────────
-- prompts.group_id — the single source of tenancy.
-- Submissions / votes / comments derive their group via prompt_id (no column).
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE prompts
  ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE;

UPDATE prompts
  SET group_id = '00000000-0000-0000-0000-000000000001'
  WHERE group_id IS NULL;

ALTER TABLE prompts
  ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX idx_prompts_group_id ON prompts(group_id);
CREATE INDEX idx_prompts_group_submission_start ON prompts(group_id, submission_start);

COMMIT;

-- ─── Post-migration verification (run manually, expect zero rows / all-true) ──
-- SELECT count(*) AS orphan_prompts FROM prompts WHERE group_id IS NULL;  -- expect 0
-- SELECT count(*) AS groups FROM groups;                                  -- expect >= 1
