# Go live — copy & paste

Everything is built and pushed. Three steps, about 10 minutes.

You only ever paste values **into Supabase and Vercel's own websites**.
Never paste a key back into the chat — anything pasted into a chat should be
treated as compromised and rotated.

---

## Step 1 — Create the database (Supabase)

1. Go to **supabase.com/dashboard** → your project → **SQL Editor** → **New query**.
2. Open the file `supabase/SETUP-EVERYTHING.sql` from this repo, select all, paste
   it into the editor, and press **Run**.

It is safe to run twice — it has been tested for that. You should see
`Success. No rows returned`.

3. Still in Supabase, go to **Settings → API** and copy these three values into a
   notepad. You will paste them into Vercel in step 2.

| Supabase label | You'll need it as |
|---|---|
| Project URL | `VITE_SUPABASE_URL` and `SUPABASE_URL` |
| `anon` `public` key | `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

> The `service_role` key bypasses every security rule. It goes **only** into the
> Vercel box below. Never put it anywhere starting with `VITE_`, because
> everything prefixed `VITE_` is compiled into the public JavaScript that any
> visitor can read.

---

## Step 2 — Deploy (Vercel)

1. Go to **vercel.com/new** → **Import Git Repository** → pick
   `ceoar7group/AR7traders-web`.
2. On the import screen set **Branch** to:

```
arena/01a0334a-ar7traders-web
```

3. Framework preset **Vite**. Build command and output directory are already
   correct from `vercel.json` — leave them.
4. Expand **Environment Variables** and add these seven. Paste the *name* on the
   left and your Supabase value on the right. Tick **Production**, **Preview**
   and **Development** for each.

```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SITE_URL
VITE_SITE_URL
```

- The first five are the Supabase values from step 1 (the URL and anon key each
  get entered twice, once with the `VITE_` prefix and once without — the browser
  build and the server functions read different names).
- `SITE_URL` and `VITE_SITE_URL` are both your live address with **no trailing
  slash**, e.g. `https://ar7traders.com`. If you don't have the domain attached
  yet, use the `.vercel.app` URL Vercel gives you and update it later.

5. Press **Deploy**.

> **This matters:** if the two `VITE_` variables are missing at build time, the
> site still deploys and looks fine, but the entire CRM is silently stripped out
> of the bundle and `#crm` shows "SUPABASE CONNECTION REQUIRED" forever. Vite
> freezes these values into the JavaScript when it builds, so **after changing
> any `VITE_` variable you must redeploy** — restarting is not enough.

---

## Step 3 — Point Supabase at the live site

Back in Supabase → **Authentication → URL Configuration**:

- **Site URL** — your live address, e.g. `https://ar7traders.com`
- **Redirect URLs** — click Add and enter:

```
https://ar7traders.com/**
```

Without this, customer password-reset and confirmation emails will bounce users
to the wrong place.

---

## Step 4 — Make yourself the admin

1. Open your live site, go to `/#crm`, and click **Create account** (or sign up
   through the customer page) using your own email.
2. The first account created is promoted to **admin** automatically.
3. Sign in, open **Team & permissions**, and add your staff from there.

If you ever need to force an account to admin, run this in the SQL editor,
replacing the email:

```sql
update public.profiles
   set role = 'admin', active = true
 where id = (select id from auth.users where email = 'you@example.com');
```

---

## Where things live afterwards

| What | Where |
|---|---|
| Add staff, set permissions | CRM → **Team & permissions** |
| Staff performance | CRM → **People & payroll** → Performance |
| Salaries and payslips | CRM → **People & payroll** → Payroll |
| Customer orders and ledger | CRM → **Customer accounts** |
| Website text, phone, email, WhatsApp number | CRM → **Website settings** |
| Cars, routes, articles shown on the site | CRM → **Website cars / Shipping routes / News & guides** |

The WhatsApp number on the floating button is edited in **Website settings** —
you never need a redeploy to change it.

### The spinning world map

The countries on the globe (and the cards under it) now come from
**CRM → Shipping routes**. Each route has two extra fields:

| Field | Meaning |
|---|---|
| **Map longitude** | -180 to 180. East is positive, west is negative. |
| **Map latitude** | -90 to 90. North is positive, south is negative. |

Fill both in and the country appears on the globe with its own shipping lane
from Japan. Leave them empty and the route still shows in the shipping
calculator and the destinations page, but is not drawn on the map.

A few examples if you need them: Saudi Arabia `39.2 / 21.5`,
Bangladesh `91.8 / 22.3`, South Africa `18.4 / -33.9`, Canada `-123.1 / 49.3`.

If you add a country we have not hand-drawn a flag for yet, the site shows a
neat gold two-letter plate instead — nothing breaks, and you can ask for the
real flag to be added later.

The coastlines of the map itself are drawing data, not content, so they stay
in the code — there is nothing to edit there and nothing that can be broken by
accident.
