# Why ar-7traders-web.vercel.app is down — and the exact clicks to fix it

_Checked: 2026-08-25 ~21:00 UTC_

## What is happening

- `https://ar-7traders-web.vercel.app/` returns **HTTP 500** for the homepage
  and for images, while `/api/*`, `robots.txt` and fonts still answer.
- Both Vercel projects attached to this repo (**`ar-7traders-web`** and
  **`ar7-traders`**) have **Deployment Protection → Vercel Authentication**
  enabled: every generated deployment URL redirects to a Vercel login screen
  ("Protected Deployment"). That blocks previews, link previews on WhatsApp and
  any visitor who is not inside your Vercel team.
- **Two projects deploy the same repository.** Each push builds twice, and the
  two projects can fight over domains. Only one of them should exist.

## Fix it in the Vercel dashboard (5 minutes, no code)

1. Go to **vercel.com → your team (ar-9) → project `ar-7traders-web`**
   (the one whose domain is `ar-7traders-web.vercel.app`).
2. **Settings → Deployment Protection**.
3. Set **Vercel Authentication** to **Standard Protection** (previews stay
   private, the production domain stays public) — or **Disabled** if you never
   need private previews. Save.
4. Still in the project: **Deployments → latest deployment → ⋯ → Redeploy**
   (leave "use existing build cache" **unchecked**). This rebuilds and
   re-uploads the static files from scratch.
5. Repeat steps 2–3 for the second project **`ar7-traders`**, then decide
   which project keeps the site:
   - Keep **one** project connected to this GitHub repo.
   - For the other one: **Settings → General → Delete Project** (or at minimum
     Settings → Git → Disconnect). Two projects building the same repo is what
     keeps causing "it broke again" surprises.
6. Confirm the production domain is listed under the surviving project:
   **Settings → Domains** should show `ar-7traders-web.vercel.app`.

## What was fixed in code (this branch)

- `api/site-content.js` — writes used `auth.ok`, a field `requireUser()` never
  returns, so **every CRM save of website content failed with a 500**. Fixed.
  Also `entity=blocks` no longer queries a non-existent `published` column.
- `supabase/SETUP-EVERYTHING.sql` + `schema.sql` + `site-content.sql` — add the
  missing `images` / `gallery` columns the photo manager writes to
  (`add column if not exists`, safe to re-run in the SQL Editor).
- CRM field overhaul: dropdowns instead of free text (statuses, countries,
  fuel/body/transmission, grades…), grouped sections, notes fields, inline
  status changes, CSV export, dashboard alerts for overdue follow-ups/tasks.

**Run the SQL once more** (Supabase → SQL Editor → paste
`supabase/SETUP-EVERYTHING.sql` → Run) so the photo galleries can be saved.
