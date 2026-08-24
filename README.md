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

Backed up: 2026-08-24
