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

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration file:
   - Copy contents from `supabase/migrations/001_initial_schema.sql`
   - Paste and run in the SQL Editor
3. Go to **Settings > API** and copy your project URL and anon key

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
