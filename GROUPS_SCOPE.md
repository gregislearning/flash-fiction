# Groups — Feature Scope

Turn Flash Fiction from a single shared arena into a multi-tenant one: users belong
to **groups**, and prompts / submissions / votes / comments / results are all scoped
to a group. Each group has at least one **group admin** who manages its prompts.

## Decisions (locked)

| Question | Decision |
|----------|----------|
| Membership | A user can belong to **multiple groups** and switches between them. |
| Joining | **Admin invites by email** only — closed/private groups, no self-serve. |
| Existing data | Migrate everything into **one default group**; all content is group-scoped going forward. |
| Visibility | **Public-read by default.** Anyone (logged-out included) can *view* a group's prompts/submissions/results — so members can show their work to non-users. Membership gates **participation** (write/vote/comment/manage), not viewing. **Private groups** (view restricted to members) are deferred. |
| Group creation | **Super-admin only** (`user_metadata.is_admin`) creates groups and names the first admin. |
| Invite email | **No email in v1** — invites generate a copy/paste accept link the admin shares manually. |
| Membership exit | **Defer to DB action** — no remove/leave UI in v1; super-admin handles it directly in the DB. |
| Notifications | **Active group only** — add `group_id` to notifications; bell shows the active group's count. |
| Empty state | **Pending-invite aware** — waiting screen that surfaces "Accept invitation" when one matches the user's email. |
| Routing | **Full `/g/[slug]` routing** — group lives in the URL so public links are shareable to non-users; replaces the cookie-based active group. |

## Delivery phasing (eng-review decision)

Ship in three independently green PRs rather than one big-bang change — keep the
structural refactor and the behavioral (tenancy) change separate so a tenant-isolation
leak is easy to bisect:

- **PR1 — Routing refactor + minimal groups table.** Move every content route under
  `app/g/[slug]/…`. To make slug resolution *real* (not inert), PR1 also lands a minimal
  `groups` table + the default group + `prompts.group_id` backfill, so `/g/[slug]`
  actually resolves and 404s correctly. Behavior is otherwise unchanged — still
  effectively one group, public RLS untouched. *(Refinement from eng review: "zero
  behavior change" can't include slug resolution unless the table exists, so the table's
  read-only half moves into PR1; the membership/RLS half stays in PR2.)*
- **PR2 — Membership, roles + RLS rewrite.** `group_members`, `group_invitations`,
  helper functions, the prompt-derived membership-gated RLS, `notifications.group_id`.
  The tenant write boundary lands here. This is the PR the pgTAP suite gates.
- **PR3 — Invites + admin UI + empty state.** Super-admin group management, invite/
  accept flow, pending-invite-aware empty state, group switcher.

## Roles (three tiers)

1. **Super-admin** — existing `auth.users.raw_user_meta_data->>'is_admin'`. Creates groups, assigns each group's first admin, can manage any group. Site-wide.
2. **Group admin** — `group_members.role = 'admin'`. Manages prompts and invites *within their group(s)*. New role.
3. **Member** — `group_members.role = 'member'`. Writes, votes, comments within their group(s).

> A user with no group membership sees an empty/"ask an admin to invite you" state.

---

## Data model changes

### New tables

```
groups
  id          uuid PK
  name        text not null             -- editable
  slug        text unique not null      -- IMMUTABLE after creation; public shareable URL
  listed      boolean not null default true  -- shown in the public `/` directory
  created_by  uuid -> auth.users        -- the super-admin
  created_at  timestamptz
  -- slug: super-admin sets at creation, auto-suggested from name (lowercased/kebab),
  -- uniqueness-checked. Never changes afterward so shared /g/[slug] links never rot.
  -- listed: load-bearing, not polish — the `/` directory filters WHERE listed = true,
  -- so a group can be public-read-by-link without being advertised in the index.

group_members
  group_id    uuid -> groups (cascade)
  user_id     uuid -> auth.users (cascade)
  role        text not null check (role in ('admin','member'))
  created_at  timestamptz
  PRIMARY KEY (group_id, user_id)

group_invitations            -- invitee may not have an account yet
  id          uuid PK
  group_id    uuid -> groups (cascade)
  email       text not null            -- normalized lowercase
  role        text not null default 'member'
  invited_by  uuid -> auth.users
  token       uuid default gen_random_uuid()  -- accept link
  accepted_at timestamptz null
  created_at  timestamptz
  UNIQUE (group_id, email) where accepted_at is null
```

### Tenancy column on existing tables

- **`prompts`** — add `group_id uuid NOT NULL REFERENCES groups(id)`. This is the
  single source of tenancy. Index `(group_id, submission_start)`.
- **`submissions`, `votes`, `submission_comments`** — **no `group_id` column.** Tenancy
  is derived from `prompt_id → prompts.group_id` inside write-path RLS. *(Earlier draft
  denormalized `group_id` here; dropped after eng review — a client-writable `group_id`
  is spoofable on INSERT, and since SELECT is public-read the column bought nothing on
  the read path. Deriving from `prompt_id` is a single-row indexed join on writes only.)*
- **`notifications`** — add `group_id`, **server-set** when the notification is created
  (never client-supplied, so not spoofable). Used for the bell's active-group count and
  the comment's group label/link.

### Helper functions (SECURITY DEFINER, mirrors existing pattern)

- `is_group_member(g uuid, u uuid) returns boolean`
- `is_group_admin(g uuid, u uuid) returns boolean`  (true if member with role='admin' **or** super-admin)

These avoid RLS recursion the same way `get_user_vote_count_for_prompt` does today.

---

## RLS rewrites (the heart of the work)

Because groups are **public-read**, SELECT policies stay open (no membership gate) —
the existing phase logic is preserved untouched. Membership gates only the **write**
paths. Concretely:

- **prompts SELECT** — stays `true` (public). *(Private groups, later, would add a
  `is_public OR is_group_member(...)` gate here.)*
- **prompts INSERT/UPDATE/DELETE** — `is_admin` → `is_group_admin(group_id, auth.uid())`.
- **submissions SELECT** — **unchanged** (keep the existing own-row-OR-after-
  `submission_end` phase gate). Writing-phase content stays hidden exactly as today.
- **submissions INSERT/UPDATE/DELETE** — keep own-row + phase rules, **AND** add
  membership derived from the prompt:
  `is_group_member((SELECT group_id FROM prompts WHERE id = prompt_id), auth.uid())`.
  Deriving from `prompt_id` (not a client column) is what closes the cross-tenant write
  hole — the membership group and the phase group are now the *same* prompt, so a member
  of A can't tag a row into B.
- **votes INSERT** — keep 2-vote cap + no-self-vote, **AND** prompt-derived membership.
- **submission_comments SELECT** — stays public; **INSERT/UPDATE/DELETE** keep the
  post-`voting_end` rule **AND** prompt-derived membership (via the comment's submission
  → prompt).
- **`search_submissions` RPC** — add a `group_id` arg so results scope to the group
  being viewed; the existing `submission_end` filter (and SECURITY INVOKER RLS) is
  unchanged. Public search of a group is fine.

---

## Application changes

### Active-group context (new core concept)

Because users have multiple groups, every page needs to know "which group am I
looking at?" Recommended approach:

**Public-read changes this.** Because logged-out visitors must be able to land on a
*specific* group to view members' work, the group identity has to live in a
**shareable URL** — a cookie can't be shared and anonymous visitors have no
membership to default to. So the active-group mechanism is now **URL-based**:

- **`/g/[slug]/…`** routes carry the group. The slug resolves the group server-side;
  no membership required to view (public-read).
- For logged-in users, a **group switcher** in `Header.tsx` navigates between their
  memberships (and any public group they land on). Optionally remember "last group"
  in a cookie purely as a redirect default for `/`.
- `getActiveGroup()` resolves from the route param (not a cookie), validating the
  slug exists; participation actions additionally check membership.

**Centralized guards (`src/lib/groups.ts`) — single source of truth for the tenant
boundary at the app layer (RLS still enforces at the DB):**

- `getGroupBySlug(slug)` — resolve + 404 if missing.
- `getActiveGroup()` — group for the current route.
- `requireMembership(group)` / `requireGroupAdmin(group)` — guards server components
  and the `/g/[slug]/admin` layout call into. Pages become one-liners; one place to
  audit "who can do what in a group." (Avoids the same check drifting across ~8 files.)

> This pulls URL routing **into v1** (it was previously deferred) because sharing is
> the whole point of public-read. It's the larger refactor — every content route
> moves under `/g/[slug]` — and is the main cost added by this requirement.

### Touch list

| Area | Change |
|------|--------|
| `app/page.tsx` (root `/`) | Becomes a **public group directory** — lists group **names only** (`SELECT name, slug FROM groups WHERE listed = true`, no per-group phase lookup → no N+1). Clicking a group routes to `/g/[slug]`, which shows that group's current prompt / active phase. Logged-out friendly. The `listed` filter keeps link-only groups out of the index. |
| `lib/prompts.ts` | `getCurrentPrompt` / queries filter by `active group_id`. |
| Move content routes under `app/g/[slug]/…` | `page`, `submit`, `submissions`, `results`, `past/*`, `search` relocate beneath the group segment; the slug resolves the group server-side. Public-read, no auth required to view. |
| Those same pages | Scope queries to the route's group. Participation surfaces (submit/vote/comment) check membership; non-members get a "join to participate" / pending-invite-aware prompt. |
| `lib/supabase/middleware.ts` | Guard `/g/[slug]/admin`: read the slug from the path, allow if `is_group_admin(slug, user)` **OR** super-admin. Guard `/admin/groups` for super-admin only. |
| Move `app/admin/*` → `app/g/[slug]/admin/*` | Group-scoped prompt management lives under the group segment so the slug is in the URL for the guard to authorize against. Prompt create/list/delete scoped to that group. |
| `Header.tsx` | Add group switcher; show active group name. |
| New `app/admin/groups/page.tsx` | **Super-admin only** (cross-group): create groups, set immutable slug, assign first admin. Stays outside `/g/[slug]`. |
| New invite UI | Group admin invites by email; new `app/invite/[token]/page.tsx` accept flow. |
| `types/database.ts` | Add `groups`, `group_members`, `group_invitations` rows + `group_id` on existing rows; update `search_submissions` args. |

### Invitation flow (admin-invites-by-email, no email infra in v1)

1. Group admin enters an email → row in `group_invitations`. The UI shows a
   **copy-able `/invite/[token]` link** the admin shares however they like (Slack,
   email, etc.). No automated send in v1.
2. Recipient opens the link:
   - Already has an account → accepting inserts `group_members`, sets `accepted_at`.
   - No account → they sign up first, then the token accepts.
3. **Belt-and-suspenders:** on signup, `app/auth/callback/route.ts` auto-claims any
   pending invitations matching the new user's email (inserts `group_members`). Done
   in the **callback route, not a DB trigger on `auth.users`** — the auth schema is
   Supabase-managed, and a trigger error there could abort signup itself; the callback
   fails soft. The empty-state "Accept invitation" button is the backstop if the
   callback ever misses.

   **Security + idempotency (eng review):**
   - **Verified-email gate.** Auto-claim only fires for a *confirmed* email (check the
     verified signal on the user before inserting). Otherwise someone could sign up as
     `victim@example.com` and absorb their invite — account-takeover of membership.
   - **Idempotent inserts.** Both the callback and the "Accept invitation" button (and
     an already-member user) can race on the `group_members` PK `(group_id, user_id)`.
     All membership inserts use `ON CONFLICT DO NOTHING`; accept also sets
     `accepted_at` defensively. No duplicate-key 500s on double-accept.

> Email delivery (Supabase Auth invite vs. a transactional provider) is deferred —
> the data model and accept flow ship now; automated send can be layered on later
> without schema changes.

### Empty state (no group membership)

`getActiveGroup()` returns `null` → main pages render a waiting screen:
"You're not in a group yet — ask an admin to invite you." If a row in
`group_invitations` matches the user's email (and is unaccepted), the screen also
shows an **"Accept invitation to *{group}*"** button that joins them on click. One
query (invitations by email) powers the difference between the bare and actionable
states.

---

## Migration plan (`009_groups.sql`)

**Wrap the whole script in `BEGIN; … COMMIT;`** so it's atomic — a mid-script failure
(especially the drop-and-recreate of RLS policies) must not leave tables with policies
dropped (default-deny) or half-applied. If anything fails, the transaction rolls back
and the live app is untouched.

1. Create `groups` (incl. `slug`, `listed`), `group_members`, `group_invitations` + helpers.
2. Insert a **default group** ("Flash Fiction" / slug `default`, `listed = true`).
3. `ALTER TABLE prompts ADD COLUMN group_id …`; backfill all rows to the default
   group; then `SET NOT NULL`.
4. Add `group_id` to **`notifications` only** (server-set going forward; backfill from
   the linked submission's prompt). *No `group_id` on submissions/votes/comments — RLS
   derives tenancy from `prompt_id`.*
5. Backfill `group_members`: every existing user → member of default group; every
   user with `is_admin = true` → role `admin`.
6. Drop and recreate all affected RLS policies with the prompt-derived membership gates.
7. Replace `search_submissions` with the group-aware version.

Applied manually via the Supabase SQL editor, consistent with `001`–`008`.

**Post-migration verification (in the same session):** assert zero `NULL` `group_id`
on `prompts` and `notifications`; every user is in the default group; prior `is_admin`
users are group admins. (See Testing.)

---

## Testing (eng-review addition)

The repo has **no test framework today**. This feature is a tenant-isolation security
boundary, so v1 introduces a **pgTAP RLS suite** under `supabase/tests/`, run via
`supabase test db`. It seeds two groups with a member, an admin, a non-member, and an
anon role, and asserts the cross-tenant cases that would otherwise leak silently:

- Member of A **cannot** SELECT B's writing-phase submissions; **can** see B's revealed
  ones (public-read) but **not** before `submission_end`.
- Anon sees revealed submissions only — never writing-phase content.
- Member of A **cannot** INSERT submissions/votes/comments into B; non-member cannot
  write into any group.
- **Spoof case (the actual #1 leak):** member of A attempts INSERT referencing **B's
  open prompt_id** — must be rejected. This is the assertion that proves the
  prompt-derived membership gate works; without it the suite passes while the hole is
  open. *(Required — without `group_id` columns there's nothing to spoof, but the test
  still pins the prompt-derived check against regression.)*
- Group admin of A **cannot** create/update/delete B's prompts; super-admin can manage
  any group.
- `search_submissions(group_id)` never returns another group's content or writing-phase
  rows.

These map 1:1 to the ← rows in the coverage diagram. App-layer guard tests
(`lib/groups.ts`, invite/accept, callback auto-claim) are noted as a follow-up (Vitest)
but the DB boundary is the non-negotiable v1 coverage.

**Migration verification (one-shot):** after `009`, assert zero `NULL` `group_id` on
`prompts`/`submissions`/`votes`/`comments`/`notifications`, and that every existing user
landed in the default group with prior `is_admin` users as group admins.

## Out of scope (v1)

- Public / global feed (explicitly folded into the default group).
- Self-serve group creation or open/discoverable groups.
- Cross-group leaderboards, global search, or moving a prompt between groups.
- Per-group theming/branding, billing, member limits.
- **Private groups** (view restricted to members) — public-read only in v1.
- **Automated invite email** — admin shares a copy/paste link in v1.
- **Remove/leave-group UI** — super-admin handles membership exits directly in the DB.

All four prior open questions are now resolved (see the Decisions table).

## What already exists (reused, not rebuilt)

| Existing | How the plan uses it |
|----------|----------------------|
| `is_admin` SECURITY DEFINER pattern (`get_user_vote_count_for_prompt`) | Mirrored for `is_group_member` / `is_group_admin` — same recursion-avoidance, no new pattern. |
| Submissions phase-gate RLS (own-row OR after `submission_end`) | Kept **untouched**; membership stacks on writes only. Public-read inherits it. |
| `search_submissions` RPC (SECURITY INVOKER + `submission_end` filter) | Extended with a `group_id` arg, not rewritten. |
| `app/auth/callback/route.ts` | Reused for invite auto-claim (no new auth surface, no `auth.users` trigger). |
| `getCurrentPrompt` / `selectCurrentPrompt` (`lib/prompts.ts`) | Reused as-is, just filtered by the route's group. |
| Existing `/admin` components (`AdminPromptForm`, `AdminPromptList`) | Relocated under `/g/[slug]/admin`, logic unchanged. |

## Failure modes (per new codepath)

| Codepath | Realistic prod failure | Test? | Error handling? | User sees |
|----------|------------------------|-------|-----------------|-----------|
| Write-path RLS (prompt-derived membership) | Policy regression reopens cross-tenant write | **pgTAP spoof test** | DB rejects | Insert error (correct) |
| `/g/[slug]` resolution | Bad/deleted slug | Guard test | `getGroupBySlug` → 404 | Clean 404, not a crash |
| Invite auto-claim (callback) | Unverified-email takeover | gated | verified-email check | claim skipped (safe) |
| Invite double-accept | Race on `group_members` PK | idempotency test | `ON CONFLICT DO NOTHING` | success, no 500 |
| Migration `009` | Mid-script failure | post-migration asserts | `BEGIN/COMMIT` rollback | app untouched |
| `/` directory | (names-only query) | — | empty list renders | "no groups yet" |

**Critical-gap scan:** no failure mode is simultaneously untested **and** silent **and**
unhandled. The closest risk — a silent cross-tenant leak — is the one the pgTAP spoof
test exists to catch. **0 critical gaps.**

## Parallelization (worktree strategy)

The phasing is inherently **sequential** — PR1 (routing + minimal groups table) is a
hard dependency for PR2 (membership/RLS), which is a hard dependency for PR3 (invites/
admin UI). Within PR3 there are two independent-ish lanes:

- **Lane A:** Super-admin group-management UI (`/admin/groups`) + group switcher.
- **Lane B:** Invite create/accept flow (`/invite/[token]`, callback auto-claim, empty state).

Both touch `lib/groups.ts` and `types/database.ts`, so flag: **Lanes A and B share
`lib/groups.ts`** — land the guard helpers first (small shared PR or PR2 tail), then A
and B can proceed in parallel worktrees with low conflict risk.

## Rough effort

| Chunk | Size |
|-------|------|
| PR1: `/g/[slug]` routing refactor + minimal groups table + directory | L (every content route relocates) |
| PR2: Membership/roles + RLS rewrite (prompt-derived) + migration | L (highest-risk; gated by pgTAP) |
| PR2: pgTAP RLS suite (new harness) | M (first tests in the repo) |
| PR3: Super-admin group management UI | S–M |
| PR3: Invite + accept flow (copy/paste link, no email) + hardening | S–M |

The PR2 RLS/migration chunk is the critical path and the easiest to get subtly wrong —
build it against a local Supabase reset, run the pgTAP suite, and confirm the spoof
test fails-closed before the UI work.

## Implementation Tasks
Synthesized from this review's findings. P1 blocks ship; P2 lands same branch; P3 follow-up.

**PR1 — routing + minimal groups table**
- [ ] **T1 (P1, human: ~1d / CC: ~1h)** — routing — Move `app/{page,submit,submissions,results,past,search}` under `app/g/[slug]/…`; add minimal `groups` table + default group + `prompts.group_id` backfill; `getGroupBySlug` resolves slug or 404s.
  - Surfaced by: Architecture A1/A3, Outside voice #8 — slug resolution needs the table to be real.
  - Verify: every old URL works at `/g/default/…`; bad slug 404s.
- [ ] **T2 (P2, human: ~2h / CC: ~20min)** — directory — Root `/` lists group names `WHERE listed = true`, links to `/g/[slug]`.
  - Surfaced by: Architecture A1 — `/` must not dead-end for anon visitors.

**PR2 — membership, RLS, tests**
- [ ] **T3 (P1, human: ~0.5d / CC: ~45min)** — migration — `009_groups.sql`: `group_members`, `group_invitations`, `is_group_member`/`is_group_admin`, `notifications.group_id`; **`BEGIN/COMMIT`-wrapped**; post-migration NULL/backfill asserts.
  - Surfaced by: Outside voice #7 — non-atomic migration can leave default-deny RLS.
- [ ] **T4 (P1, human: ~0.5d / CC: ~45min)** — rls — Rewrite write-path policies to **prompt-derived** membership; `prompts` writes → `is_group_admin`; `search_submissions` gains `group_id` arg.
  - Surfaced by: Outside voice #1 — client-writable `group_id` was a cross-tenant write hole.
- [ ] **T5 (P1, human: ~1d / CC: ~1.5h)** — tests — pgTAP suite in `supabase/tests/`: 2 groups × {member, admin, non-member, anon}, all cross-tenant cases **incl. the spoof INSERT (foreign prompt_id)**.
  - Surfaced by: Test review T1 + Outside voice #2 — suite must assert the actual leak.
- [ ] **T6 (P1, human: ~3h / CC: ~30min)** — auth — Middleware guard on `/g/[slug]/admin`: `is_group_admin(slug,user)` OR super-admin; `/admin/groups` super-admin only.
  - Surfaced by: Architecture A3 — guard needs the slug in the URL.
- [ ] **T7 (P2, human: ~2h / CC: ~20min)** — lib — `src/lib/groups.ts`: `getGroupBySlug`, `getActiveGroup`, `requireMembership`, `requireGroupAdmin`.
  - Surfaced by: Code quality C1 — one audit point, no drift.

**PR3 — group management + invites**
- [ ] **T8 (P1, human: ~0.5d / CC: ~45min)** — admin — `/admin/groups` (super-admin): create group, set **immutable** slug (auto-suggest + uniqueness), assign first admin.
  - Surfaced by: Architecture A2 — slug immutability + collision handling.
- [ ] **T9 (P1, human: ~0.5d / CC: ~45min)** — invites — Invite-by-email UI (copy `/invite/[token]` link) + accept flow at `app/invite/[token]/page.tsx`.
  - Surfaced by: Scope decision — admin-invites, no email infra.
- [ ] **T10 (P1, human: ~3h / CC: ~30min)** — auth — Callback auto-claim: **verified-email gate** + `ON CONFLICT DO NOTHING`.
  - Surfaced by: Outside voice #4/#5 — takeover + double-accept.
- [ ] **T11 (P2, human: ~2h / CC: ~20min)** — ui — Pending-invite-aware empty state; group switcher in `Header.tsx`.
  - Surfaced by: Scope decisions — empty state + multi-group switching.

**Follow-up**
- [ ] **T12 (P3)** — tests — Vitest app-layer coverage (see TODOS.md).
  - Surfaced by: Test review — app-layer guards untested in v1.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 14 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **OUTSIDE VOICE:** Claude subagent — 8 findings; #1 (client-writable `group_id` →
  cross-tenant write hole) was critical and is fixed by dropping the denorm and deriving
  membership from `prompt_id`. #2/#3/#4/#5/#7/#8 folded in; #6 (notifications) kept
  active-group-only by user decision.
- **CROSS-MODEL:** one tension (notification scope) — surfaced, user kept the locked
  active-only decision.
- **UNRESOLVED:** 0.
- **VERDICT:** ENG CLEARED — ready to implement. No critical gaps. Recommended next:
  `/plan-design-review` for the new public directory, group switcher, and admin/invite UI.
