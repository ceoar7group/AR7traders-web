# AR7 Traders — Website + CRM (Master Backup) 🚗

Complete master backup of the AR7 Traders website and CRM.

**Owner:** AR7 Group — ceoar7grouplimited@gmail.com
**Live site:** https://ar7traders.com • **CRM:** https://ar7traders.com/#crm

## What's inside

| Path | Contents |
|---|---|
| `src/` | Website code + full CRM app (React + Vite) |
| `api/` | Serverless functions — lead capture + CRM API |
| `supabase/` | Database schema (`schema.sql`) + setup guide (`SETUP.md`) |
| `public/assets/` | All car & gallery images |
| `index.html`, `vite.config.js`, `vercel.json` | Site entry & deploy settings |

## Restore / redeploy
1. Import this repo into Vercel (framework: **Vite**) — that's it, the site builds itself.
2. Connect Supabase project `supabase-ar7crm` (env vars: see `supabase/SETUP.md`).
3. Run `supabase/schema.sql` in the Supabase SQL Editor.

## Local development

`node_modules/` is git-ignored, so a fresh clone (or a fresh sandbox) has no
dependencies. Install before anything else:

```bash
npm ci          # uses package-lock.json; use `npm install` if the lockfile is missing
npm run dev     # website dev server on 0.0.0.0
npm run build   # website → dist/
npm run build:crm        # CRM → crm-preview/dist/
npm test        # every suite below, in order (this is what CI runs)
npm run test:currency    # currency logic + render tests
npm run test:inventory   # inventory table/grid/listings render tests
npm run test:seo         # per-page SEO head + Car/Breadcrumb JSON-LD
npm run test:authz       # CRM/site/approval authorization (the permission grid, enforced)
npm run test:crm         # mounts the real CRM, walks every tab, checks the grid
npm run test:leads       # public enquiry-form validation
```

CI (`.github/workflows/ci.yml`) runs `npm test` plus both builds on every push
and pull request.

Both test scripts bundle through esbuild into `node_modules/.tmp/`, so they also
need dependencies installed first. Requires Node >= 20.19.0.

Backed up: 2026-08-24
