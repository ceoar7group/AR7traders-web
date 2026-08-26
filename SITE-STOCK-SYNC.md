# Keeping the live website stock in sync

The public website (ar7traders.com) does **not** read its car list from the
code — it reads the Supabase table `site_listings` through
`/api/site-content?entity=listings`. The list built into `src/main.jsx` is
only a fallback for when the API is unreachable. **Whatever is in the database
is what visitors see.**

The source of truth for the current stock is `src/site-content.seed.json`
(25 cars: 12 showroom cars AR7-26001–AR7-26012 with photo galleries, plus
13 authentic Goo-net cars). Whenever that file is updated with a new stock,
the database must be synced to match it.

## The one-click way (no terminal)

1. Open the CRM: **https://ar7traders.com/#crm** and sign in as the
   administrator.
2. Click the **Website cars** tab (left menu).
3. Click the gold **"Sync website stock to latest"** button in the toolbar,
   then confirm.

Done. The button shows a notice with the result (e.g. *13 inserted, 12
updated, 30 hidden*), and the live site updates on the next page load.

What it does, exactly:

- Inserts any seed car that is missing from the database.
- Updates every seed car in place (matched by stock number), including the
  photo galleries, `published = true`, and `sort_order` = its position in
  the seed file. Positions 1–12 are the showroom section — the site treats
  `sort_order <= 12` as showroom, so the first 12 seed rows must always be
  the showroom cars.
- Hides database cars that are **not** in the seed by setting
  `published = false`. Nothing is deleted — you can re-publish a hidden car
  at any time from the Website cars tab, so the operation is reversible.
- Writes a line to the CRM **Activity log** with who ran it and the result.

Run it again any time — it is idempotent (a second run changes nothing).

## The terminal way (optional)

The same sync can be run from a machine with your Supabase credentials:

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/sync-site-listings.mjs
```

Flags:

- `--dry-run` — prints exactly what would change and writes nothing.
  Always a good first step after a big stock change.
- `--hard-delete` — **permanently deletes** database rows that are not in
  the seed instead of hiding them. Default behaviour is to hide
  (reversible); only use this flag when you are sure the old rows should
  be gone for good.

The button and the script share one implementation (`scripts/sync-core.mjs`),
so they can never drift apart. A regression test lives at
`scripts/sync-core.test.mjs` (`node scripts/sync-core.test.mjs`).

## Checking the result

```
curl "https://ar7traders.com/api/site-content?entity=listings"
```

should return exactly the 25 published seed cars, in seed order: the 12
showroom cars first (sort_order 1–12), then the 13 Goo-net cars (13–25).
