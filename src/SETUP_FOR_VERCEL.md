# Setup for deployment (Supabase-backed)

The app is a plain Vite project: `index.html` → `src/app.js` → `src/api.js` (real Supabase client or demo mock).

## 1. Create the backend

In your Supabase project, open the SQL editor and run the whole file `supabase/schema.sql`.
It is idempotent — re-running is safe. It creates:

- All tables (profiles, shops, payments, expenses, expense_budgets, savings_goals, savings_deposits, notifications, activity)
- Row Level Security (building data shared by all authenticated staff; notifications and profiles per-user)
- `notify_staff()` and `set_user_role()` RPC helpers used by the app
- Realtime publications for live cross-session updates

## 2. Configure environment variables

Set these for the deployed app:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Without them the app runs in **Demo mode** (localStorage mock) and shows a demo banner.

## 3. Build & deploy

- Install: `pnpm install`
- Dev: `pnpm dev`
- Build: `pnpm build` → static output in `dist/`
