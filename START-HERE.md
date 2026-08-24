# Go live — 4 steps, about 15 minutes

No commands to run. No terminal. Just copy, paste, click.

Do them in order. If anything looks different from what's written here, stop and
tell me what you see rather than guessing.

---

## Step 1 — Build the database (5 min)

1. Go to **supabase.com** → open your AR7 project
2. Left sidebar → **SQL Editor**
3. Click **+ New query**
4. Open the file **`supabase/SETUP-EVERYTHING.sql`** from this repo, select all
   of it, copy, and paste into the box
5. Click **Run** (bottom right)

You should see `Success`. At the bottom it prints a small table of accounts —
empty for now, which is correct.

This one file creates all 12 tables and loads your current website content:
**42 cars, 6 shipping routes, 4 articles.**

*Already ran part of this before? Run it anyway. It's built to be safe to
re-run — it skips whatever already exists and will not duplicate your cars.*

---

## Step 2 — Copy your 3 keys (3 min)

Still in Supabase: **Settings** (gear, bottom left) → **API**.

Keep this tab open. You need three values:

| On the Supabase page | Looks like |
|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` |
| **anon / public** key | very long, starts `eyJ...` |
| **service_role** key | very long, starts `eyJ...` (click *Reveal*) |

🔒 The **service_role** key is a master key to your whole database. Never put it
in a chat, an email, or anywhere public. It only goes in the Vercel box in
Step 3.

---

## Step 3 — Add the keys to Vercel (5 min)

1. Go to **vercel.com** → your AR7 project
2. **Settings** → **Environment Variables**
3. Add these three, one at a time. For each: type the name, paste the value,
   leave all three environment checkboxes ticked, click **Save**.

| Name (type exactly) | Value to paste |
|---|---|
| `VITE_SUPABASE_URL` | your Project URL |
| `VITE_SUPABASE_ANON_KEY` | your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your service_role key |

⚠️ **The third name must NOT start with `VITE_`.** Anything beginning `VITE_`
gets published inside the website's public code where anyone can read it. That
is fine for the first two — they're designed to be public — but the service_role
key would hand a stranger your entire database.

4. Go to the **Deployments** tab → newest deployment → **⋯** menu → **Redeploy**

Environment variables only take effect on a new build, so this redeploy is
required.

---

## Step 4 — Create your login (2 min)

1. Back in Supabase → **Authentication** → **Users** → **Add user** →
   *Create new user*
2. Email: **ceoar7grouplimited@gmail.com** (must be this exact address — see
   below)
3. Password: choose your own, write it in your password manager
4. Tick **Auto Confirm User** ✅
5. Click **Create user**

Now open **`https://your-site.com/#crm`** and sign in.

You will be an **admin automatically.** Step 1 installed a rule that promotes
that email the moment the account is created — that's why the address has to
match. Everyone else who signs up gets the limited "sales" role, so your staff
can work leads but cannot change the public website.

**On your password:** I deliberately don't create it or email it. Emailed
passwords sit in two mailboxes forever and are a common way accounts get stolen.
You set it, only you know it. Please turn on 2FA in Supabase too.

---

## Done — what you can now do

Sign in to `/#crm` and you'll see three new sections in the sidebar:

- **Website cars** — the 42 vehicles on your site. Change a price or photo, hit
  save, and the public website shows it.
- **Shipping routes** — the 6 destinations and freight rates in the calculator.
- **News & guides** — your 4 articles.

Plus the CRM you already had: Leads, Customers, Inventory, Quotes, Shipments,
Tasks, Activity. Everything can be added, edited and deleted, with a
confirmation before anything is removed.

**Your site cannot go blank.** If the database is ever unreachable, the website
falls back to the content built into the code. Worst case visitors see slightly
old content — never an empty page.

---

## If something goes wrong

| What you see | What it means |
|---|---|
| "SUPABASE CONNECTION REQUIRED" at `/#crm` | Step 3 keys missing, or you skipped the redeploy |
| Can sign in, but sections are empty | Step 1 didn't finish — re-run the SQL file |
| "Admin access required" when saving | Your account isn't admin. Check the email in Step 4 matches exactly |
| Website looks unchanged after an edit | Hard-refresh: Ctrl+Shift+R (Cmd+Shift+R on Mac) |
| Vercel build fails | Known issue: the git author isn't on your Vercel team. Vercel → Settings → Members |

Tell me the exact message and I'll sort it.

---

## Want to keep a practice version?

The demo CRM still works and touches nothing real — it saves to your browser
only. Good for training staff. Run locally with `VITE_CRM_DEMO=true`, or ask me
to set up a permanent demo link.
