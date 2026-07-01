# TODOS

## Groups PR2 — deferred verification (do before PR3 UI)

### pgTAP RLS suite (the tenant-isolation gate) — ✅ DONE
- **What:** The pgTAP suite under `supabase/tests/rls_groups_test.sql` that the scope
  makes the gate for the membership/RLS work (migration `010`). Split out of PR2 because
  the dev machine had no `supabase` CLI / Docker to run it in-session.
- **Status:** Green — 19/19 assertions pass standalone via `supabase db reset &&
  supabase test db`. The cross-tenant **spoof INSERT** (member of A referencing B's open
  `prompt_id`) is confirmed to fail-closed.
- **Coverage (1:1 with scope "Testing"):** 2 groups × {member, admin, non-member, anon}:
  member of A can't SELECT B's writing-phase rows but can see revealed ones; anon sees
  revealed only; member of A can't INSERT submissions/votes/comments into B; **spoof
  INSERT rejected**; group admin of A can't manage B's prompts, super-admin can; 
  `search_submissions(group_id)` never returns another group's or writing-phase rows.
- **How:** install `supabase` CLI + start Docker → `supabase db reset` → `supabase test db`.
- **Note:** a fresh `db reset` of these migrations leaves anon/authenticated without DML
  table grants (only `Dxtm`), so the suite grants the Supabase DML baseline at the top of
  its (rolled-back) transaction to exercise the RLS policies. Worth confirming production
  actually grants anon/authenticated SELECT/INSERT (vs. all reads/writes going through the
  service role) — the migrations carry no `GRANT` statements.

### Middleware guard + admin route move (carried to PR3) — ✅ DONE
- PR3 moved `app/admin/*` prompt management to `app/g/[slug]/admin/*` (scoped to the
  route's group) and added the middleware guard: `/g/[slug]/admin` allows the group admin
  of that slug OR a super-admin (via the same `is_group_admin` the DB RLS uses);
  `/admin/groups` stays super-admin only. Flat `/admin` now redirects to `/admin/groups`.

## Groups PR3 — shipped
- Migration `011`: SECURITY DEFINER `create_group` (super-admin; existing-account admin →
  membership, else admin invitation), `accept_invitation` (verified-email + email-match
  gated, idempotent), `claim_my_invitations` (callback bulk auto-claim), `get_invitation_by_token`
  + `my_pending_invitations` (read paths for invitees who can't SELECT invitations),
  `is_super_admin`, and `group_invitations` admin-manage policies.
- App: `/admin/groups` (create group + name first admin), `/g/[slug]/admin` (prompt mgmt +
  invite-by-email with copy/paste links), `/invite/[token]` accept flow, callback auto-claim,
  pending-invite-aware empty state on `/`, and a group switcher in `Header.tsx`.
- Verified: tsc clean, `next build` green, pgTAP suite still 19/19, and all `011` functions
  exercised against a local reset (create→invite→register→claim, verified-email gate,
  idempotency, both create_group branches).

## Groups feature — post-v1 follow-ups

### Vitest app-layer test coverage
- **What:** Add Vitest integration tests for the Groups app layer.
- **Why:** v1 ships pgTAP tests for the RLS tenant boundary (the actual enforcement),
  but the TypeScript guards and flows have no automated coverage.
- **Pros:** Regression net for `lib/groups.ts` (the single audit point for "who can do
  what in a group"); catches app-layer drift a refactor could introduce.
- **Cons:** Stands up a second test harness (the repo had none before pgTAP); seeding a
  local Supabase for integration tests is some setup.
- **Context:** Cover `getGroupBySlug` (404 on bad slug), `requireMembership` /
  `requireGroupAdmin` (block non-member / non-admin), invite create → accept →
  membership, and `app/auth/callback/route.ts` auto-claim including the **verified-email
  gate** and **`ON CONFLICT DO NOTHING` idempotency**. Run against a seeded local
  Supabase (`supabase db reset`). Naming: follow whatever Vitest convention is set when
  the harness lands.
- **Depends on / blocked by:** Groups PR2 (membership/RLS) and PR3 (invites) merged.

## Deferred from Groups v1 (captured in GROUPS_SCOPE.md "Out of scope")
- Automated invite email (Supabase Auth invite vs. transactional provider) — v1 uses a
  copy/paste link.
- Private groups (view restricted to members) — `groups.listed`/public-read shipped; the
  member-only-view gate on SELECT is the later addition.
- Remove/leave-group UI — super-admin handles membership exits in the DB for v1.
- Global labeled notification bell — v1 is active-group-only by decision; revisit if
  multi-group membership becomes common.
