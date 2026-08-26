# Connect Vercel — copy & paste

Real links, in order. Roughly 10 minutes.

Do **Part A** first, then **Part B**. Part B needs values from Part A.

---

## Part A — Supabase (get your keys)

### A1. Open the SQL editor

<https://supabase.com/dashboard/project/_/sql/new>

Open `supabase/SETUP-EVERYTHING.sql` from this repo, select all, paste it in,
press **Run**. You should see `Success. No rows returned`.

Safe to run more than once — that has been tested.

### A2. Open your API keys

<https://supabase.com/dashboard/project/_/settings/api>

Keep this tab open. You need three values from it in Part B:

| On the Supabase page | Looks like |
|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` |
| **anon public** | a long string starting `eyJ...` |
| **service_role** | a different long string starting `eyJ...` |

> The **service_role** key bypasses every security rule in your database.
> It only ever gets pasted into the Vercel page in Part B. Never send it in a
> chat, an email or WhatsApp — including to me.

---

## Part B — Vercel

### B1. Import the repository

<https://vercel.com/new>

Find **AR7traders-web** in the list and click **Import**.

If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel
access to `ceoar7group/AR7traders-web`, then come back.

> Use this page, not a "Deploy" button. A deploy button makes a *copy* of the
> repo, and your copy would stop receiving my updates.

### B2. Framework preset

Set it to **Vite**.

Leave build command and output directory alone — `vercel.json` already sets
them correctly.

### B3. Environment variables

Expand **Environment Variables**. Add these seven, ticking **Production**,
**Preview** and **Development** for each.

Names to paste on the left:

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SITE_URL
VITE_SITE_URL
```

Values on the right:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | Project URL from A2 |
| `VITE_SUPABASE_ANON_KEY` | anon public key from A2 |
| `SUPABASE_URL` | Project URL again |
| `SUPABASE_ANON_KEY` | anon public key again |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key from A2 |
| `SITE_URL` | your live address, no trailing slash |
| `VITE_SITE_URL` | same address again |

The URL and anon key go in twice on purpose — the browser build and the
server functions read different names.

For `SITE_URL` / `VITE_SITE_URL`, if you don't have a domain yet, use your
Vercel deployment address and correct it later. The live domain is
`https://www.ar7traders.com`.

> **The one that catches people out:** if the two `VITE_` variables are
> missing, the site still deploys and looks completely normal — but the CRM is
> silently stripped out and `/#crm` shows "SUPABASE CONNECTION REQUIRED"
> forever, with no error anywhere. Double-check those two before deploying.

### B4. Deploy

Press **Deploy** and wait about a minute.

---

## Part C — Point Supabase at the live site

Now you know your real address, go back to Supabase:

<https://supabase.com/dashboard/project/_/auth/url-configuration>

- **Site URL** — your live address, e.g. `https://www.ar7traders.com`
- **Redirect URLs** — click Add and enter, with the two stars:

```
https://www.ar7traders.com/**
```

Without this, password-reset emails send people to the wrong place.

---

## Part D — Make yourself the admin

1. Open your live site and go to `/#crm`
2. Click **Create account**, using your own email
3. The first account created becomes admin automatically

If that ever fails, run this in the SQL editor with your email:

```sql
update public.profiles
   set role = 'admin', active = true
 where id = (select id from auth.users where email = 'you@example.com');
```

---

## Done — what happens from now on

Once Part B is finished the connection is permanent:

```
you ask me for a change  ->  I push to GitHub  ->  your site updates
```

About a minute, no action from you. You never repeat this setup.

Watch deployments here:

<https://vercel.com/dashboard>

---

## One thing to do first

I opened a pull request that brings `main` up to date with all the finished
work:

<https://github.com/ceoar7group/AR7traders-web/pull/1>

**Please click Merge on that page before starting Part B.**

Why it matters: Vercel deploys whichever branch your repository calls the
default — and it gives you **no way to pick a branch** on the import screen.
Your default is `main`, which is currently missing the last 13 commits. Import
without merging and you'd deploy an old version with no CRM, and my future
changes wouldn't appear.

It's a clean fast-forward: nothing on `main` is changed or removed, 13 commits
are simply added. Merging it means Part B works with no extra configuration.
