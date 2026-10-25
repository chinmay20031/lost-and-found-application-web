# Goodfind web

React + TypeScript + Vite client for the same Supabase project used by the Android app. It uses the existing `reports`, `claims`, and `report_contacts` schema, `create_report`/claim/handover RPCs, and public `report-images` Storage bucket. No separate backend or migration is required.

## Run locally

1. Copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` to the Supabase project URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its public publishable key. The Vite client also accepts `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as aliases.
3. From this folder, run `npm install` and `npm run dev`.
4. For a production build, run `npm run build`; preview it with `npm run preview`.

The `NEXT_PUBLIC_` prefix is intentionally exposed to browser code. Never use a `service_role` key or any secret key in `.env.local` or browser code. `.env.local` is gitignored.

## Supabase dashboard setup

- Run the existing `supabase/migrations/202610230001_lost_found.sql` from the Android project against this same Supabase project if it has not already been applied. The migration provides the public `report-images` bucket (JPEG, PNG, WebP; 5 MB maximum), RLS policies, and all RPCs used here. This web client does not require schema changes.
- In **Authentication → URL Configuration**, add the exact local development URL shown by Vite (typically `http://localhost:5173`) to **Redirect URLs**. Add the deployed web origin as well. Configure the **Site URL** to the deployed web origin when it is live.
- In **Authentication → Providers → Email**, enable email sign-up and email confirmation. New users need to confirm the link before signing in. Password recovery redirects to the current web origin; make sure that origin is allow-listed above.
- Keep the existing RLS and Storage policies enabled. Public reports/photos are intentionally visible to everyone. Contact details are returned only by `accepted_contact` for an accepted claimant; private claim details are fetched only through the owner-only `report_claims` RPC. Do not put private identifying clues in public report text or photos.
