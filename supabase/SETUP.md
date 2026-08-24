# AR7 CRM — Supabase setup

1. Create a new Supabase project.
2. Open **SQL Editor**, paste `schema.sql`, and click **Run**.
3. Open **Authentication → Users → Add user** and create the first staff account.
4. In SQL Editor, promote it to administrator using the final statement in `schema.sql` with that user's UUID.
5. In Vercel project settings add:
   - `VITE_SUPABASE_URL` — Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` — Supabase anon/publishable key
   - `SUPABASE_URL` — same Project URL
   - `SUPABASE_ANON_KEY` — same anon/publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` — service-role secret (server only; never prefix with VITE_)
6. Redeploy the Vercel project.
7. Open `https://your-domain/#crm` and sign in.

Never paste the service-role key into chat, source files, GitHub, or any variable beginning with `VITE_`.
