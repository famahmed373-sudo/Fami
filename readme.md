# Fahmi

Fahmi is a building management workspace for **shop rental payments, expenses/budgets, savings goals and alarms** — built with vanilla JavaScript, Vite and Supabase. It is designed for an admin plus a team of managers and payment officers, all working on the same live data.

## Features

- **Shops & tenants** — register, edit, release and track shop units (name, shop number, tenant, phone) with arrears calculated automatically.
- **Shop photos** — attach photos to any shop (upload & delete) to record the deal, condition and key details; stored in a public Supabase Storage bucket.
- **Rent collection** — record full or partial payments, reverse mistakes (kept in the audit trail), export CSV.
- **Expenses & budgets** — building-wide spending against monthly category budgets with overrun alarms.
- **Savings goals** — shared goals with deposits, progress and completion milestones.
- **Alarms & reminders** — overdue rent, due rent, budget overruns and goal milestones, surfaced as notifications with per-user preferences.
- **Multi-staff roles** — Admin, Manager, Payment Officer and Viewer. Admins manage roles; every role change is logged and the affected user is notified.
- **Team notifications** — when any staff member records a payment, expense, shop or savings action, **every staff member is notified in real time** (bell + toast).
- **Audit trail** — every significant action (shops, payments, expenses, budgets, savings, roles, profiles) is logged with who, what and when.
- **Realtime** — Supabase Realtime keeps all open sessions in sync as soon as anything changes.

## Tech stack

- Frontend: HTML + CSS + vanilla JavaScript (ES modules) bundled by Vite
- Backend: Supabase (PostgreSQL, Auth, Row Level Security, Realtime, RPC functions)
- No framework dependencies beyond `@supabase/supabase-js`

## Roles

| Role | Can do |
| --- | --- |
| Admin | Everything, including assigning roles to staff |
| Manager | Shops, payments, expenses, budgets, savings |
| Payment officer | Payments and shops |
| Viewer | Read-only access to everything |

## Going live (production)

1. **Create a Supabase project** and run `supabase/schema.sql` in the SQL editor. The script creates all tables (including `shop_images`), RLS policies, the staff RPC helpers, realtime publications and the public `shop-images` storage bucket, and is safe to re-run.
2. **Set the environment variables** for the deployed app:
   - `VITE_SUPABASE_URL` — your Supabase project URL (e.g. `https://xyz.supabase.co`)
   - `VITE_SUPABASE_ANON_KEY` — the public anon key from Supabase → Settings → API
   - Without these the app runs in **Demo mode** with a localStorage-backed mock database (demo accounts `admin@fami.demo`, `marta@fami.demo`, `eyob@fami.demo`, password `fami1234`).
3. **Deploy** — build output is static (`vite build` → `dist/`). Install: `pnpm install`, dev: `vite`, build: `vite build`.

## How staff join

1. Share the app URL with your managers.
2. They open it and tap **Create account**.
3. You (admin) open **Users & roles** and assign their role — they are notified immediately.

## Scripts

```bash
pnpm install    # install dependencies
pnpm dev        # local dev server (port 3000)
pnpm build      # production build to dist/
pnpm preview    # serve the production build
```
