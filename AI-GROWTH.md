# AI Growth agents — setup, and what they are allowed to do

CRM → **AI Growth** is one desk for three agents:

| Agent | What it does | Default schedule |
| --- | --- | --- |
| **Lead Gen & CRM** | Reads enquiries, scores buyer readiness with evidence, matches published **and Available** stock, estimates CIF (or says *quotation required*), and writes a WhatsApp reply **draft**. | weekdays 07:05 |
| **SEO Engine** | Turns verified notes into destination guides, market-watch drafts and research briefs, reports keyword opportunities (measured vs catalogue-derived), and runs safe technical checks. | Tue & Fri 06:35 |
| **Social Media** | Picks a published, Available machine, writes the channel captions, the specification card, alt text and hashtags, and queues them for approval. | daily 08:10 |

Every agent is **disabled** until you switch it on, and **dry-run** by default.

## What an agent can and cannot do

- It produces **drafts only**. Nothing is published, sent or posted by a run.
- Publishing an article, sending a message and posting to a channel each need a
  **separate, explicit approval** in CRM → AI Growth. An approval unlocks
  execution; it does not perform it.
- Sending also needs a **configured, authorised provider connection**
  (`WHATSAPP_CLOUD_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, or
  `META_GRAPH_TOKEN` + `INSTAGRAM_BUSINESS_ID`, or `LINKEDIN_ACCESS_TOKEN`).
  Without one the message is recorded as **prepared** and shown to a person to
  send — never as delivered.
- An executed article is saved **unpublished** in News & guides. If a
  *published* article already owns the slug, execution stops and the draft goes
  back to review instead of silently unpublishing live content.
- Every run is **bounded** (max items), **leased** (two runs cannot overlap),
  **idempotent** (one run per agent per hour, so a retried schedule cannot
  double-post) and stops immediately on the **emergency stop**, a disabled or
  paused agent, or the daily ceiling. The response always says which one it was.

## Setup (once)

1. **Run the migration** in Supabase → SQL Editor:
   `supabase/MIGRATION-2026-10-ai-growth.sql`
   It is idempotent (safe to re-run), creates the six `ai_*` tables with RLS on
   and no public policies, seeds the five `ai_growth_*` settings, and ends with
   `select pg_notify('pgrst','reload schema');` so PostgREST picks the tables up
   immediately. Without it the desk renders and tells you exactly this.
2. **Add the provider key** in Vercel → Settings → Environment Variables
   (Production, Preview and Development), then redeploy:

   | Variable | Purpose |
   | --- | --- |
   | `GEMINI_API_KEY` | Server-only Gemini key from Google AI Studio. Free tier — **do not enable billing**. |
   | `SEO_GEMINI_MODEL` | Optional. Editorial model. Default `gemini-3.8-flash`. |
   | `GOONET_GEMINI_MODEL` | Optional. Model for the car importer's parser assist, tuned separately. |

   The key is never sent to the browser, never a `VITE_*` variable and never
   committed. Without it every agent still works from the deterministic factual
   formatter — it files research briefs instead of generated prose, and the desk
   says so. **Nothing ever falls back to a paid provider**: OpenAI is used only
   if you set `SEO_AI_PROVIDER=openai` yourself.
3. **Press “Test provider”** on the desk. It proves the key works for the chosen
   model without generating or saving anything, and reports the exact state when
   it does not (no key, rejected key, model unavailable, daily quota spent,
   rate limited, timeout, truncation, safety refusal, empty output).
4. **Switch on the agents you want** (per agent: Enabled, Paused, Dry run).
   Leave *Dry run* on until the drafts read the way you want them. *Unattended
   send authorised* is a deliberately separate switch and should stay off until
   a channel connection exists.
5. **The schedule runs itself.** `.github/workflows/ai-growth.yml` calls
   `api/goonet-sync.js?job=agents` with the existing `GOONET_SYNC_KEY` secret —
   the same free pattern the stock importers use. No Vercel cron add-on, no
   extra Serverless Function (the Hobby limit is 12 and this repo is at 12).
   Run it by hand any time from **Actions → AI Growth agents → Run workflow**.

## Approval workflow

1. Open **AI Growth → Overview** (or a workspace). Drafts appear under
   *Review queue* with the evidence behind them: the readiness score and its
   reasons, the consent decision, the matched stock, the CIF status, the source
   list, or the per-channel captions and publication blockers.
2. **Approve** (or **Reject**, which keeps the record) — approval is recorded
   with your name.
3. **Execute** the approved draft. The *Execution result* panel then shows
   exactly what happened: an unpublished article created, a message recorded as
   `prepared`, a stock revalidation, or the reason nothing happened.
4. **Emergency stop** in the banner stops every agent and blocks execution
   immediately, without a redeploy.

## Where to look when something is wrong

- **Desk banner / provider panel** — key missing, model rejected, quota spent.
- **Jobs table** — per-run status, counts, provider usage, and a *Cancel /
  release lease* action per row.
- **Draft detail** — the run's step-by-step outcomes, the warnings, the exact
  error, and who approved or executed it.
- **Daily limits** — agent settings hold per-run and per-day ceilings; the desk
  reports `limit-reached` rather than running past them.

Free-tier privacy note: Google may use free-tier content to improve their
products. Do not put customer contact details, supplier pricing or documents
into an agent's notes — the prompts are built from your own records only, and
the code strips instruction-like text from anything a customer wrote.
