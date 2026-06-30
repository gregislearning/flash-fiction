# Flash Fiction — Architecture

A competitive flash fiction platform where users respond to time-bound writing prompts, vote on anonymous submissions, and claim authorship after results are revealed.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Server Components) |
| Language | TypeScript (strict mode) |
| Database | Supabase (PostgreSQL + Row-Level Security) |
| Auth | Supabase Auth via `@supabase/ssr` (email/password) |
| Styling | Tailwind CSS v4, Geist fonts |
| Hosting | Vercel-ready (standard Next.js deployment) |

## Directory Layout

```
src/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (Header, fonts, metadata)
│   ├── page.tsx                  # Home — current challenge display
│   ├── submit/page.tsx           # Story submission form
│   ├── submissions/page.tsx      # Anonymous voting gallery
│   ├── results/page.tsx          # Winner reveal + claim authorship
│   ├── search/page.tsx           # Full-text search over visible submissions
│   ├── notifications/page.tsx    # In-app notifications (comments on your work)
│   ├── past/
│   │   ├── page.tsx              # Archive of completed prompts
│   │   └── [promptId]/page.tsx   # Single past prompt with stories
│   ├── admin/page.tsx            # Prompt management (admin-only)
│   ├── auth/
│   │   ├── signin/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   ├── callback/route.ts     # OAuth/magic link exchange
│   │   └── signout/route.ts      # POST → sign out + redirect
│   ├── loading.tsx               # Route-level loading skeletons (per segment)
│   └── globals.css               # Tailwind theme + CSS variables
├── components/                   # Shared React components
│   ├── Header.tsx                # Navigation, auth state, sign out
│   ├── PromptCard.tsx            # Prompt display with phase badge + countdown
│   ├── PromptBadges.tsx          # Object / location badges on a prompt
│   ├── Countdown.tsx             # Client-side live countdown timer
│   ├── SubmissionForm.tsx        # Write/edit/delete story (word count enforced)
│   ├── SubmissionCard.tsx        # Anonymous story card with vote + claim
│   ├── CommentSection.tsx        # Post-results comments on a submission
│   ├── SearchBox.tsx             # Query input that drives /search
│   ├── Toast.tsx                 # Transient notifications/feedback
│   ├── VoteButton.tsx            # Cast/retract vote
│   ├── ClaimButton.tsx           # Claim authorship post-results
│   ├── AdminPromptForm.tsx       # Create new prompt
│   └── AdminPromptList.tsx       # List + delete prompts
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client (cookies)
│   │   └── middleware.ts         # Session refresh + admin route guard
│   ├── prompts.ts               # selectCurrentPrompt — pick the "current" round
│   ├── voting-submission-order.ts # Stable anonymized order for voting gallery
│   └── utils.ts                  # Phase logic, word count, date formatting
├── types/
│   └── database.ts               # DB row types, phase enum, extended types
└── middleware.ts                  # Next.js middleware entry point
```

## Database Schema

Five tables, all governed by Row-Level Security:

```
┌──────────────┐       ┌──────────────────┐       ┌────────────┐
│   prompts    │       │   submissions    │       │   votes    │
├──────────────┤       ├──────────────────┤       ├────────────┤
│ id (uuid PK) │◄──┐   │ id (uuid PK)     │◄──┐   │ id (uuid)  │
│ title        │   └───│ prompt_id (FK)   │   └───│ submission │
│ description  │       │ user_id (FK)     │       │  _id (FK)  │
│ word_limit   │       │ content          │       │ prompt_id  │
│ submission_  │       │ word_count       │       │  (FK)      │
│  start (ts)  │       │ claimed (bool)   │       │ user_id    │
│ submission_  │       │ author_email     │       │  (FK)      │
│  end (ts)    │       │ search_tsv       │       │ created_at │
│ voting_end   │       │ created_at       │       └────────────┘
│  (ts)        │       └──────────────────┘
│ object       │                                  UNIQUE(prompt_id,
│ location     │       UNIQUE(prompt_id, user_id)    user_id, submission_id)
│ created_at   │       One submission per user     Up to 2 votes per user
└──────────────┘                                   per prompt

┌──────────────────────┐       ┌──────────────────────┐
│  submission_comments │       │    notifications     │
├──────────────────────┤       ├──────────────────────┤
│ id (uuid PK)         │◄──┐   │ id (uuid PK)         │
│ submission_id (FK)   │   │   │ user_id (FK)         │
│ user_id (FK)         │   │   │ submission_id (FK)   │
│ author_email         │   └───│ comment_id (FK)      │
│ content              │       │ message              │
│ created_at           │       │ comment_preview      │
└──────────────────────┘       │ unread (bool)        │
                               │ created_at / read_at │
                               └──────────────────────┘
                               UNIQUE(user_id, submission_id)
                                 WHERE unread = true
```

### RLS Policies

- **Prompts** — publicly readable; only admins can create, update, or delete. Admin status is read from `auth.users.raw_user_meta_data->>'is_admin'`.
- **Submissions** — visibility is phase-gated: content hidden during writing (authors see only their own), revealed once `submission_end` passes. Users can only insert/update/delete their own during the writing phase; a second UPDATE policy lets authors toggle `claimed` after `voting_end`.
- **Votes** — users can cast **up to 2 votes per prompt** during the voting phase only; self-voting is blocked. The 2-vote cap is enforced in the INSERT policy via the `get_user_vote_count_for_prompt` SECURITY DEFINER helper (avoids RLS recursion).
- **Submission comments** — publicly readable; authenticated users can comment only after `voting_end`. Users can edit/delete their own.
- **Notifications** — users can read and mark-as-read only their own. Inserts/updates are restricted to notifications generated from the authenticated user's own comment on the target submission. A partial unique index keeps at most one *unread* notification per (user, submission).

### Functions & triggers

- `get_submission_vote_count(uuid)` — vote tally for a submission (SECURITY DEFINER).
- `get_user_vote_count_for_prompt(prompt, user)` — backs the 2-vote cap (SECURITY DEFINER).
- `search_submissions(q, lim)` — full-text search RPC over `submissions.search_tsv`, returning ranked `ts_headline` snippets. Runs SECURITY INVOKER so RLS applies, and additionally filters to `now() >= submission_end` so writing-phase content is never returned. Granted to `anon` and `authenticated`.
- `notify_submission_comment_received()` — `AFTER INSERT` trigger on `submission_comments` that creates/replaces an unread notification for the submission author (skips self-comments; recovers from the unique index under concurrent inserts).

## Prompt Lifecycle

Each prompt moves through four sequential phases based on timestamps:

```
  upcoming          writing           voting            results
─────┼───────────────┼─────────────────┼─────────────────┼──────►
     submission_start             submission_end           voting_end
```

| Phase | What happens |
|-------|-------------|
| **Upcoming** | Prompt is visible but submissions aren't open yet |
| **Writing** | Authenticated users can submit one story per prompt (word limit enforced) |
| **Voting** | All submissions shown anonymously (in a stable, salted order — see `voting-submission-order.ts`); users cast up to two votes per prompt |
| **Results** | Vote counts revealed, winners displayed; authors can claim their work |

Phase logic lives in `src/lib/utils.ts` (`getPromptPhase`) and drives the UI across every page.

## Authentication

- **Method**: Email/password via Supabase Auth.
- **Session management**: `@supabase/ssr` stores the session in cookies. The Next.js middleware (`src/middleware.ts` → `src/lib/supabase/middleware.ts`) refreshes the session on every request.
- **Admin role**: Determined by `user_metadata.is_admin === true`, set directly in the Supabase dashboard. The middleware blocks non-admin users from `/admin`.
- **Protected routes**: `/submit` requires authentication; `/admin` requires authentication + admin role.

## Data Flow

There are no `/api/*` routes. All data access happens through the Supabase client:

- **Server Components** use `createClient()` from `src/lib/supabase/server.ts` to query data at request time (prompts, submissions, votes, user session).
- **Client Components** use `createClient()` from `src/lib/supabase/client.ts` for mutations (submit story, cast vote, claim authorship) via Supabase's JS client with `router.refresh()` to re-render server components after writes.
- **Admin operations** (create/delete prompts) follow the same pattern through the admin page's client components.

## Styling

- **Tailwind CSS v4** configured via `@tailwindcss/postcss`.
- **Theme** defined in `globals.css` using CSS custom properties under `:root` and `@theme inline`, with automatic dark mode via `prefers-color-scheme`.
- **Color palette**: Zinc-based neutrals with semantic phase colors (blue for upcoming, green for writing, purple for voting, amber for results).
- **Fonts**: Geist Sans (body) and Geist Mono (code), loaded via `next/font/local`.

## Migrations

Applied in order under `supabase/migrations/`:

Migrations are applied **manually** — paste each file's SQL into the Supabase SQL editor in numeric order (the CLI `db push`/`db reset` path also works for local Docker development).

| Migration | Purpose |
|-----------|---------|
| `001_initial_schema.sql` | Creates `prompts`, `submissions`, `votes`, RLS policies, indexes, and `get_submission_vote_count` |
| `002_extend_writing_period_24h.sql` | Extends the writing window by 24h for active prompts |
| `003_add_claim_columns.sql` | Adds `claimed` / `author_email` to submissions + post-results claim UPDATE policy |
| `004_allow_two_votes.sql` | Swaps the per-prompt vote constraint for a 2-vote cap (`get_user_vote_count_for_prompt`) |
| `005_submission_comments.sql` | Adds `submission_comments` table + RLS (comments open after `voting_end`) |
| `006_prompt_object_location.sql` | Adds `object` / `location` columns to prompts |
| `007_notifications_comment_on_submission.sql` | Adds `notifications` table, RLS, dedup index, and comment-notification trigger |
| `008_submission_search.sql` | Adds generated `search_tsv` column + GIN index + `search_submissions` RPC |

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous API key |
| `NEXT_PUBLIC_SITE_URL` | Public (optional) | Base URL for auth redirects |
