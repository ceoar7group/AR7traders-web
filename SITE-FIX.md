# Site outage 2026-08-25 — what happened, what was fixed, what to tidy up

_Status: **RECOVERED** 2026-08-25 ~21:20 UTC — the homepage, API and assets are
serving again after a fresh production deployment of PR #8._

## What happened

- `https://ar-7traders-web.vercel.app/` returned **HTTP 500** for the homepage
  while `/api/*`, `robots.txt` and fonts still answered — the production
  deployment was in a broken state.
- A fresh production build (PR #8, merged 2026-08-25) re-uploaded every file
  and the site came back. The broken deployment is no longer in use.

## Two things worth tidying in the Vercel dashboard (recommended)

- Both Vercel projects attached to this repo (**`ar-7traders-web`** and
  **`ar7-traders`**) have **Deployment Protection → Vercel Authentication**
  enabled: every generated deployment URL redirects to a Vercel login screen
  ("Protected Deployment"). Production domains stay public (Hobby plan), but
  preview links cannot be shared with anyone outside your Vercel team.
- **Two projects deploy the same repository.** Each push builds twice, and the
  two projects can fight over domains. Only one of them should exist.

## Tidy it up in the Vercel dashboard (5 minutes, no code)

1. Go to **vercel.com → your team (ar-9) → project `ar-7traders-web`**
   (the one whose domain is `ar-7traders-web.vercel.app`).
2. **Settings → Deployment Protection**: set **Vercel Authentication** to
   **Standard Protection** (production public, previews private) or
   **Disabled** if you never need private previews. Save.
3. Repeat for the second project **`ar7-traders`**, then decide which project
   keeps the site:
   - Keep **one** project connected to this GitHub repo.
   - For the other one: **Settings → General → Delete Project** (or at minimum
     Settings → Git → Disconnect). Two projects building the same repo doubles
   every build and is what keeps causing "it broke again" surprises.
4. Confirm the production domain is listed under the surviving project:
   **Settings → Domains** should show `ar-7traders-web.vercel.app`.
5. If the homepage ever shows a 500 again: **Deployments → latest → ⋯ →
   Redeploy** with the build cache **unchecked** — a fresh re-upload fixed it
   this time.

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
