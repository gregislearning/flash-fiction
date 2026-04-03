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
│   └── globals.css               # Tailwind theme + CSS variables
├── components/                   # Shared React components
│   ├── Header.tsx                # Navigation, auth state, sign out
│   ├── PromptCard.tsx            # Prompt display with phase badge + countdown
│   ├── Countdown.tsx             # Client-side live countdown timer
│   ├── SubmissionForm.tsx        # Write/edit/delete story (word count enforced)
│   ├── SubmissionCard.tsx        # Anonymous story card with vote + claim
│   ├── VoteButton.tsx            # Cast/retract vote
│   ├── ClaimButton.tsx           # Claim authorship post-results
│   ├── AdminPromptForm.tsx       # Create new prompt
│   └── AdminPromptList.tsx       # List + delete prompts
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client (cookies)
│   │   └── middleware.ts         # Session refresh + admin route guard
│   └── utils.ts                  # Phase logic, word count, date formatting
├── types/
│   └── database.ts               # DB row types, phase enum, extended types
└── middleware.ts                  # Next.js middleware entry point
```

## Database Schema

Three tables, all governed by Row-Level Security:

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
│  end (ts)    │       │ created_at       │       │ created_at │
│ voting_end   │       └──────────────────┘       └────────────┘
│  (ts)        │
│ created_at   │       UNIQUE(prompt_id, user_id)  UNIQUE(prompt_id, user_id)
└──────────────┘       One submission per user     One vote per user per prompt
```

### RLS Policies

- **Prompts** — publicly readable; only admins can create, update, or delete.
- **Submissions** — visibility is phase-gated: content hidden during writing, revealed during voting/results. Users can only insert/update/delete their own during the writing phase.
- **Votes** — users can vote once per prompt during the voting phase only. Self-voting is blocked.

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
| **Voting** | All submissions shown anonymously; users cast one vote per prompt |
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

| Migration | Purpose |
|-----------|---------|
| `001_initial_schema.sql` | Creates tables, RLS policies, and indexes |
| `002_extend_writing_period_24h.sql` | Extends the writing window by 24h for active prompts |
| `003_add_claim_columns.sql` | Adds `claimed` and `author_email` columns to submissions |

## Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous API key |
| `NEXT_PUBLIC_SITE_URL` | Public (optional) | Base URL for auth redirects |
