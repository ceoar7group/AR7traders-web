# Where everything lives, and how to move it

Your project is in **two separate places**. Both matter, and losing either one
hurts. This explains what's where, how to back each up, and how to move the
site to a different host if you ever want to.

---

## The two halves

| Half | What's in it | Where it lives | Backed up by |
|---|---|---|---|
| **The code** | Website design, pages, CRM, 68 car photos | GitHub | ✅ Done — pushed |
| **The data** | Cars, routes, articles, leads, customers, quotes | Supabase | ⚠️ You must set this up |

The code is safe. **The data is not backed up yet** — see below.

---

## 1. The code — already backed up

Everything is pushed to GitHub:

- **Repo:** `github.com/ceoar7group/AR7traders-web`
- **Branch:** `arena/01a0334a-ar7traders-web`
- 101 files including all 68 images

To download a copy to your own computer at any time:

```
git clone https://github.com/ceoar7group/AR7traders-web.git
cd AR7traders-web
git checkout arena/01a0334a-ar7traders-web
```

Or without any tools: open the repo on github.com → green **Code** button →
**Download ZIP**.

### Getting this onto your main branch

The work sits on a branch, not on `main`. When you're happy with it, open a
**Pull Request** on GitHub from `arena/01a0334a-ar7traders-web` into `main` and
merge it. I've deliberately not done this — merging to `main` is what triggers
your live deployment, and you asked me not to publish.

---

## 2. The data — set this up

Code in GitHub does **not** include your database. If Supabase were lost, your
leads and customers would go with it. Supabase does back up automatically, but
the free plan keeps only a short window, so keep your own copy too.

**Monthly, takes 2 minutes:**

Supabase → your project → **Database** → **Backups** → **Download**

Store it somewhere that isn't your laptop — Google Drive is fine.

Worth doing before any big change, too.

---

## 3. Moving to a different host

The site is a plain static build plus a few serverless functions, so it runs
almost anywhere. Nothing is locked to Vercel.

Every host needs the same three things:

- **Build command:** `npm run build`
- **Output directory:** `dist`
- **The 3 environment variables** from `.env.example`

| Host | Notes |
|---|---|
| **Vercel** | Current setup. `vercel.json` is already configured. |
| **Netlify** | Works. The `/api` functions need moving to `netlify/functions/`. |
| **Cloudflare Pages** | Works. `/api` becomes Pages Functions. |
| **Any static host** | The website works. The CRM needs the `/api` functions hosted somewhere. |

The one migration cost is the **`/api` folder** — four small files written in
Vercel's function format. Any other host needs them adapted. It's a small job;
ask me when you need it.

Supabase itself is portable — it's standard PostgreSQL. You can export the whole
database and load it into any Postgres provider.

---

## 4. Rebuilding from scratch

If everything vanished tomorrow, this is the full recovery:

1. Clone the repo from GitHub (section 1)
2. Create a new Supabase project
3. Run **`supabase/SETUP-EVERYTHING.sql`** in its SQL Editor — rebuilds all 12
   tables and reloads the 42 cars, 6 routes and 4 articles
4. Restore your database backup on top, to bring back leads and customers
5. Deploy the code, set the 3 environment variables

Steps 1–3 get your public website back exactly as it is now. Step 4 is the only
part that depends on you having taken backups — which is why section 2 matters.

---

## 5. Version pinning (why your build won't randomly break)

Dependencies used to be set to `"latest"`, meaning every deploy pulled the
newest React and Vite available. That's a real hazard: a routine redeploy months
from now could fail, or the site could break, with nobody having changed a line
of code.

They're now pinned to the exact versions in use:

```
react 19.2.8   vite 8.2.2   @supabase/supabase-js 2.109.0
```

Verified by cloning the repo fresh and building from scratch — identical output.
Your build is reproducible.

---

## Quick reference

| I want to... | Do this |
|---|---|
| Get the code | Clone from GitHub, or Download ZIP |
| Back up the data | Supabase → Database → Backups → Download |
| Put changes live | Open a PR from the branch into `main`, merge |
| Move hosts | `npm run build` → `dist`, plus the 3 env vars |
| Start over | Clone repo, run `SETUP-EVERYTHING.sql`, restore backup |
| Run locally | `npm install` then `npm run dev` |
