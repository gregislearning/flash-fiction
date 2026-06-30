# TODOS

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
