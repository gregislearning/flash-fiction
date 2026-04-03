# Flash Fiction

A lightweight creative writing app for flash fiction competitions. Users write short stories based on prompts, vote anonymously, and discover winners.

## Features

- **Timed Prompts**: Admin creates prompts with writing and voting deadlines
- **Anonymous Submissions**: Stories are anonymous during voting
- **One Vote Per User**: Each user gets one vote per prompt
- **Winner Reveal**: Authors revealed after voting ends
- **Real-time Word Count**: Live word counting with limit validation

## Tech Stack

- **Next.js 14** - App Router, Server Components
- **Supabase** - PostgreSQL, Auth, Row Level Security
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## Getting Started

### 1. Clone and Install

```bash
git clone <your-repo>
cd flash-fiction
npm install
```

### 2. Set Up Supabase (hosted)

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run each file in `supabase/migrations/` **in numeric order** (`001` … `007`).
3. Go to **Settings > API** and copy your project URL and anon key

Or use the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) against that project: `supabase link`, then `supabase db push`.

### 3. Configure Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### 4. Create an Admin User

1. Sign up through the app at `/auth/signup`
2. Go to Supabase Dashboard > **Authentication > Users**
3. Click on your user, then **Edit User**
4. Add to user metadata: `{"is_admin": true}`
5. Save changes

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Local Supabase + production data snapshot

Use this when you want Docker-backed local Auth, PostgREST, and Postgres with data copied from a hosted project.

**Requirements:** [Docker Desktop](https://www.docker.com/products/docker-desktop/), [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). If local Postgres errors mention a version mismatch, set `[db] major_version` in [`supabase/config.toml`](supabase/config.toml) to match your hosted database (`SHOW server_version;` in the SQL editor).

1. **Start the stack and apply migrations**

   ```bash
   npm run supabase:start
   npm run supabase:reset
   ```

   `supabase db reset` recreates Postgres, applies everything in `supabase/migrations/`, then runs `supabase/seed.sql` (empty by default).

2. **Dump data from hosted** (from the [backup docs](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore); use your **Database** password and **Connect** string from the dashboard):

   ```bash
   supabase db dump --db-url "postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres" \
     -f backups/data.sql --use-copy --data-only
   ```

   Prefer a `backups/` path (gitignored). Add `-x "storage.buckets_vectors" -x "storage.vector_indexes"` if the CLI includes those tables and you hit errors. Never commit dump files.

3. **Load data into local Postgres**

   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
     --single-transaction --variable ON_ERROR_STOP=1 -f backups/data.sql
   ```

   If the hosted schema is ahead of your migration files, fix migrations first or the import will fail.

4. **Point the app at local Supabase**

   ```bash
   supabase status
   ```

   Set `NEXT_PUBLIC_SUPABASE_URL` to the **API URL** (e.g. `http://127.0.0.1:54321`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the **anon key** in `.env.local`. Sign-in flows use local GoTrue; email testing uses **Inbucket** (URL shown in `supabase status`).

**Scripts:** `npm run supabase:start` · `supabase:stop` · `supabase:status` · `supabase:reset`

**Physical backups:** If you download `db_cluster.backup` from the dashboard, see [Restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup) (match Postgres version, then `supabase start` for the full stack).

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import your repo at [vercel.com/new](https://vercel.com/new)
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key |

## Project Structure

```
src/
├── app/
│   ├── page.tsx           # Landing page
│   ├── auth/              # Sign in/up pages
│   ├── submit/            # Story submission
│   ├── submissions/       # Voting gallery
│   ├── results/           # Winner display
│   └── admin/             # Admin panel
├── components/            # React components
├── lib/
│   ├── supabase/          # Supabase clients
│   └── utils.ts           # Helper functions
└── types/
    └── database.ts        # TypeScript types
```

## Prompt Lifecycle

1. **Upcoming**: Prompt is scheduled but writing hasn't started
2. **Writing**: Users can submit their stories
3. **Voting**: Submissions are anonymous, users vote for favorites
4. **Results**: Winner announced, authors revealed

## License

MIT
