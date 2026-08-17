# CrysTrack

Your personal progress companion. Track tasks, goals, assignments, and finances in one beautiful, immersive dashboard.

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - Run the SQL in `src/db/migrations/0000_initial.sql` in the SQL Editor
   - Copy your project URL and anon key

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your Supabase credentials
   ```

4. **Run locally**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

5. **Deploy to Vercel**
   - Push to GitHub
   - Import to [vercel.com](https://vercel.com)
   - Add environment variables
   - Deploy!

## Features

- **Dashboard** - Today-first overview with quick stats
- **Regular Tasks** - Recurring habits with streaks
- **Goals** - Long-term objectives with check-ins
- **Assignments** - Deadline-driven tasks with urgency
- **Finance** - Savings targets and expense tracking
- **History** - Unified activity timeline
- **AI Insights** - Data-driven analysis
- **Adaptive Theme** - Time and weather-responsive visuals
- **3D Background** - Immersive WebGL environment

## Tech Stack

- Next.js 14 + React + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (Auth + PostgreSQL)
- Drizzle ORM
- React Three Fiber (3D)
- Framer Motion (animations)

## License

MIT
