-- 012_group_member_roster.sql — group-admin member roster.
--
-- The group admin UI needs to list a group's members (email + role), but two
-- things block a plain query:
--   1. group_members SELECT RLS is own-row only (a member can't read the roster).
--   2. emails live in auth.users, which the authenticated role can't read.
-- Both are solved by a single SECURITY DEFINER function that returns the roster
-- only to a caller who is a group admin (or super-admin) of that group — mirrors
-- the search_submissions / is_group_admin definer pattern. Read-only; no new
-- write policies on group_members (role changes / removal stay DB-side for now).

BEGIN;

CREATE OR REPLACE FUNCTION get_group_members(p_group_id UUID)
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, joined_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gm.user_id, au.email::text, gm.role, gm.created_at
  FROM group_members gm
  JOIN auth.users au ON au.id = gm.user_id
  WHERE gm.group_id = p_group_id
    AND is_group_admin(p_group_id, auth.uid())   -- gate: admins/super-admins only
  ORDER BY (gm.role = 'admin') DESC, au.email;    -- admins first, then by email
$$;

GRANT EXECUTE ON FUNCTION get_group_members(UUID) TO authenticated;

COMMIT;
