# AR7 CRM — Go Live

Everything in the code is ready. The remaining steps must be run by you, because
this sandbox has **no network access to Supabase or Vercel** (both time out), so
I cannot provision the database, set env vars, or create your admin account.

Total time: about 15 minutes.

---

## Step 1 — Create the database tables

Supabase dashboard → **SQL Editor** → New query. Run these two files, in order:

1. `supabase/schema.sql` — CRM tables (leads, customers, vehicles, quotes,
   shipments, tasks, activities, profiles)
2. `supabase/site-content.sql` — **new**: website content tables
   (`site_listings`, `site_routes`, `site_articles`, `site_blocks`)

---

## Step 2 — Import the current website content

So the CRM opens with the real 42 cars, 6 shipping routes and 4 articles that
are on the live site today — not an empty screen.

```bash
# from the repo root, with your service-role key:
SUPABASE_URL="https://YOURPROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/import-site-content.mjs
```

Run it once. It skips rows that already exist, so a second run is harmless.

---

## Step 3 — Environment variables in Vercel

Project → Settings → Environment Variables. Add for **Production**:

| Name | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |

**`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `VITE_`.** Anything starting
with `VITE_` is compiled into the public JavaScript bundle and readable by any
visitor. The service-role key bypasses all row-level security.

Do **not** set `VITE_CRM_DEMO` in production. Leaving it unset switches the CRM
from demo data to your real database. (See "Keeping the demo" below.)

---

## Step 4 — Create your admin account

1. Deploy, then visit `https://yourdomain.com/#crm`
2. Supabase → **Authentication → Users → Add user**
3. Enter your email, set a password, tick **Auto Confirm User**
4. The **first** account ever created becomes an administrator automatically —
   if this is your first sign-in there is nothing more to do.

   To promote somebody later, run this in the SQL Editor. The email lives on
   `auth.users`, not on `profiles`, so the two have to be joined:

```sql
update public.profiles p
set role = 'admin', active = true
from auth.users u
where u.id = p.id
  and u.email = 'ceoar7grouplimited@gmail.com';
```

   Easier still: once you are an administrator, use **CRM → Team**, which does
   the same thing with a dropdown.

5. Sign in at `/#crm` with that email and password.

**About emailing you the password:** I can't, and it would be unsafe if I could.
This sandbox has no mail server, and emailing credentials in plain text is one of
the most common ways accounts get compromised — it leaves your password sitting
in two mailboxes permanently. Set the password yourself in Step 4 so nobody else
ever sees it, and use a password manager. Turn on 2FA in Supabase while you're
there.

---

## What the CRM can now edit on the website

Three new sections in the sidebar, above Activity:

| Section | Controls |
|---|---|
| **Website cars** | The 42 vehicles on Home / Inventory / Auction — price, photo, mileage, grade, status, sort order |
| **Shipping routes** | The 6 destinations and freight rates behind the shipping calculator |
| **News & guides** | The 4 articles, full body text |

Add, edit and delete all work, with a confirmation prompt before deleting.

The website reads this content from `/api/site-content` on page load. If the API
is ever unreachable, it silently falls back to the built-in content already in
the code, so **the site can never render blank** because of a database problem.

### Safety rules baked in

- Public visitors get a **read-only** view, and only rows marked `published`.
- Every write requires a signed-in **admin**. Your `sales` staff can work leads
  and customers but cannot alter the public website.
- Website content changes are **audited** — created, updated *and* deleted all
  write an Activity row naming who did it. (The older `api/crm.js` still does not
  log deletions; worth fixing separately.)

---

## Keeping the demo data

Demo mode is preserved exactly as it was. Two ways to keep using it:

- **Locally:** `VITE_CRM_DEMO=true npm run dev` — no database needed, writes to
  browser localStorage, resets when you clear site data.
- **Alongside production:** create a second Vercel project from the same repo
  with `VITE_CRM_DEMO=true` and no Supabase keys. You get a permanent demo URL
  for training staff, with zero risk to live data.

In demo mode the three website sections are seeded from
`src/site-content.seed.json`, a real snapshot of the current live site, so the
demo looks like the real thing.

---

## Not done, and why

- **I did not deploy.** Vercel is unreachable from here, and you have a standing
  instruction not to touch the hosted site. Nothing has been pushed. When you
  are ready, merge this branch and Vercel will build it.
- **A previous deploy was failing** on the git author `ceoar7grouplimited@gmail.com`
  not being a Vercel team member. Fix that in the Vercel dashboard first, or the
  build will not start.
