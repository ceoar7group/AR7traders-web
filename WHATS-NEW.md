# What's new — the 15 things you asked for

Plain-language guide to everything added in this update. Nothing here is live
yet; it all runs on your preview until you decide to publish.

---

## Before anything works: run the database update

Open **Supabase → SQL Editor**, paste the whole of
`supabase/SETUP-EVERYTHING.sql`, and press Run.

It is safe to run more than once — running it twice changes nothing the second
time. It adds the new tables (team permissions, activity log, approvals,
orders, payments, settings) without touching what you already have.

Then add one new setting in Vercel → Settings → Environment Variables:

```
SITE_URL = https://ar7traders.com
```

That is only used to build the link inside password-reset emails.

---

## 1. Team members with different permissions

**CRM → Team**

Five roles: Administrator, Manager, Sales, Accounts, Viewer.

Add a colleague with their name, email, role and a starting password. The grid
underneath is the important part — each row is a thing someone can do, each
column is a role. Tick a box to allow it. It takes effect immediately; nobody
needs to log out and back in, and nothing needs redeploying.

Administrators always have every permission — those boxes are locked on purpose
so you cannot accidentally lock yourself out.

You can also disable a member (they keep their history, they just cannot sign
in) or set them a new password.

### The grid is now enforced everywhere (2026-09-30)

Before this, the grid was only partly wired up. `/api/crm` accepted writes from
any signed-in member regardless of their boxes, so a Viewer could create and
edit leads, customers and inventory by calling the API directly. Meanwhile
"Edit the public website" was ticked for Manager in the grid but the endpoint
hard-required Administrator, so Managers were refused.

Now every write checks the matching permission:

| Tab | Permission |
|---|---|
| Leads | Add / edit leads |
| Customers | Add / edit customers |
| Inventory | Add / edit inventory |
| Quotes | **Add / edit quotes** (new) |
| Shipments | **Add / edit shipments** (new) |
| Tasks | **Add / edit tasks** (new) |
| Website cars, Shipping routes, News & guides, Japan dealer stock | Edit the public website |

**One step needed in Supabase.** Quotes, shipments and tasks are new rows, so
re-run `supabase/SETUP-EVERYTHING.sql` in the SQL Editor (it is safe to re-run)
to add them. Until you do, the API falls back to the same defaults in code, so
nothing breaks — but the new boxes will not be visible in the grid.

Two related hardenings: the **Activity log is now read-only** through the API
(it always was in the UI), so log entries cannot be forged or edited; and an
**approval request can only carry the columns its record type actually has**,
so a crafted request cannot smuggle changes past whoever approves it.

## 2. Activity log

**CRM → Activity**

Every create, edit, delete, payment, allocation and login-as is written down
with who did it and when. Nothing in the CRM writes to the database without
leaving a line here. Staff cannot edit or delete these entries.

## 3. Approvals for sensitive actions

**CRM → Approvals**

Deleting is now permission-based. If someone's role has *Delete records
directly*, deleting works as before. If it does not, pressing delete creates an
approval request instead — the record stays exactly where it is and the staff
member sees "Sent to an administrator for approval."

You then Approve (which performs the deletion) or Reject it. Either way the
decision is recorded with your name against it.

To make Sales staff go through approval, untick *Delete records directly* for
the Sales role in the Team screen.

## 4. Customer dashboard with orders

**CRM → Accounts → open a customer**

Two ways to add a car to a customer:

- **Import from website** — pick a car from your live listings. Vehicle, stock
  number and price are copied across automatically.
- **Add order** — type in a car that was never listed on the site. Direct
  auction buys, private sales, anything.

Either way it becomes an order with a price, a status and a balance.

## 5. The customer sees it on the website

They log in at **Account** on the website and see every vehicle, what it cost,
what they have paid, what is left, and a progress bar per car. It is the same
data you see in the CRM — there is no second place to keep updated.

## 6 & 8. Ledger, multiple payments, unapplied funds

**Record payment** on the customer's account. Amount, method (TT, Cash, Card,
Cheque, Other), TT/reference number, bank and date.

The money lands as **unapplied funds** — it belongs to the customer but is not
tied to any car yet. When you are ready, press **Apply funds** and choose an
order and an amount.

This gives you exactly what you asked for:

- One car paid across several TTs — record each one, apply each to the same order.
- One TT covering several cars — apply part of it to each.
- An advance with no car chosen yet — record it and leave it unapplied.
- Applied something to the wrong car — press the ✕ next to it and the money goes
  straight back to unapplied funds.

The database itself refuses to let you apply more than a payment actually
contains, so the books cannot go wrong even by accident.

## 7. Log in as a customer

**CRM → Accounts → open a customer → Open their account**

Opens their real website account in a new tab, seeing exactly what they see.
Useful when someone phones and says "I can't find my order." No password is
needed or revealed. Every use is written to the activity log.

Restricted by the *Log in as a customer* permission.

## 9. Their login ID and password — an honest answer

You asked to see the customer's password in the CRM. **That is not possible,
and it is not a limitation worth working around.**

Passwords are not stored. What is stored is a scrambled fingerprint that cannot
be turned back into the original — not by us, not by Supabase, not by anyone who
steals the database. That is precisely what protects your customers if anything
ever leaks. Any system that *can* show you a customer's password is a system
that is one break-in away from handing every password to a stranger.

So the account screen gives you the three things you actually need when someone
is locked out:

- **Their login ID (email)** and when they last signed in — shown plainly.
- **Set new password** — you choose one and read it to them.
- **Email reset link** — they choose their own; you never see it.

Plus **Open their account**, which solves most "I can't log in" calls without
touching the password at all.

## 10. Forgot password

On the website login there is now **Forgot your password?**. The customer types
their email, gets a link, sets a new password. Entirely self-service.

Staff can also trigger the same email from the CRM.

## 11 & 12. Contact details editable from the CRM

**CRM → Website**

Six fields: contact email, phone, address, WhatsApp number, WhatsApp greeting,
and the inbox enquiries are delivered to. Save, and the website updates — the
contact page and the footer both read from here.

## 13. Backup

Everything is committed and pushed to your GitHub repository on this branch, so
you can pull it down or deploy it anywhere. See `BACKUP-AND-PORTABILITY.md`.

## 14. Blinking WhatsApp button

Bottom-right of every page, with a soft outward pulse and a small wave a couple
of seconds after the page loads. Hovering expands it to read "Chat on
WhatsApp". Tapping opens WhatsApp with your greeting already typed.

The number and greeting come from **CRM → Website**, so you change it in one
place.

It respects "reduce motion" accessibility settings — visitors who have asked
their device to stop animations get a still button rather than a moving one.

## 15. SEO

- Proper page titles and descriptions for all 14 public pages, updating as
  visitors move around, so search results and browser tabs read correctly.
- Link previews for WhatsApp, Facebook and X — sharing the site now shows a
  photo, headline and description instead of a bare address.
- Structured data telling Google you are a vehicle dealer in Tokyo, the
  countries you serve, and answers to three common questions — the kind of
  thing that can earn expanded search listings.
- `robots.txt` and `sitemap.xml` listing every public page. Submit the sitemap
  once in Google Search Console.
- Descriptive alt text on every image, which helps both search and screen readers.
- CRM, account and portal pages marked "do not index" — private areas stay out
  of search results.

**One honest caveat:** the site is built as a single page with `#` addresses
(`ar7traders.com/#inventory`). Google handles this, but plain addresses
(`ar7traders.com/inventory`) rank better. Converting is a larger job and worth
doing separately once you are happy with everything else.

---

## 16. Prices and ledgers in 11 currencies

**Everywhere at once** — the website header, the customer portal and the CRM.

- Eleven currencies: **JPY, USD, EUR, GBP, PKR, AUD, NZD, CAD, AED, SAR, KES**.
- **USD stays the base currency.** Every amount the systems store — orders,
  payments, budgets, vehicle prices — remains in USD, so the ledger maths
  (applied / unapplied / balance due) is untouched and totals always add up.
  Other currencies are a display and entry layer on top.
- **On the website:** a currency picker in the header converts every vehicle
  price, the CIF / duty calculators and the portal demo instantly. The choice
  is remembered per visitor. In USD the exact price text published from the CRM
  is shown verbatim; in other currencies it converts at the current rate.
- **In the customer portal:** customers pick their currency and see their
  orders, payments and balances in it, with a clear note that invoices are
  issued in USD or JPY.
- **In the CRM:** a picker in the top bar switches every KPI — pipeline value,
  accepted quotes, lifetime revenue, payroll, ledger balances — into any of the
  eleven currencies for reporting.
- **Entering orders and payments in a foreign currency:** staff pick the
  currency next to the amount; the form shows the USD equivalent live and
  stores the original amount plus the rate used, so statements can show both.
- **Exchange rate manager** in **CRM → Website settings**: every rate is
  editable, with a $10,000 sample conversion per currency, a reset-to-defaults
  button, and a "last updated" stamp. Saving pushes the new rates to the live
  website immediately — no redeploy. Until you save your own, sensible
  built-in rates keep everything working.

Run `supabase/SETUP-EVERYTHING.sql` once more — it adds the two ledger columns
(`amount_original`, `fx_rate`) and the `exchange_rates` setting. It is safe to
run again on an existing database.

---

## 17. The 900+ experience figure now stands out

**Home page hero, the "Japan to everywhere" section, and the About page.**

You asked for the founder-experience figure to be impossible to miss. It is
now a large headline-sized number (68px on a desktop, sized down sensibly on
phones) with a gold **+**, the line *"vehicles sold across our founder's
automotive career"* underneath it and the honesty qualifier — *"Experience
gained through various suppliers; these are not AR7 Traders sales totals."* —
kept as small print right beside it on every page where the figure appears.

On 2026-09-29 the figure was lowered from 1,200+ to **900+** at the owner's
direction; see `CLAIMS-POLICY.md` §1. Everything else stayed the same: the
words are exactly as approved, and the qualifier stays visible next to the
number, never hidden.

*(Superseded later on 2026-09-29: the qualifier line was removed and the
figure now animates — see §19.)*

**Also in this update:** sharing any page of the site now uses a picture
picked for that page — stock-yard photo for the inventory pages, port scene
for shipping, inspection photo for auction pages — and sharing a single
vehicle link uses that vehicle's own photograph, instead of every link
showing the same default image.

---

## 18. Reviews trust card and sharper photography

**The Customer stories page (/reviews).** Instead of a bare "no reviews"
message, the page now opens with a styled **"Verified Buyer Feedback"**
trust card: a cluster of placeholder initials in the brand colours (with a
gold **+** badge) beside the headline, an honest notice that genuine reviews
are being collected right now, and a "Bought from us? Share your experience"
button. The initials are decorative placeholders — the page says so in plain
words — and no invented testimonials or star ratings are shown. When the
first real, consented reviews arrive, they replace the placeholders.

**/contact hero photo.** The blurry 500×322 dock picture was replaced with a
crisp 1400×900 photograph of a Japanese Ro-Ro car carrier dock at sunrise,
with Land Cruisers and Lexus vehicles lined up on the quay.

**Staff CRM demo thumbnails.** The five small dealer-stock demo photos were
upscaled to 800×600 so nothing in the CRM looks fuzzy. The photos themselves
are the same genuine dealer images — only the resolution improved.

---

## 19. The 900+ figure now counts up — and the small print is gone

**Home page hero, the "Japan to everywhere" section, and the About page.**

Done as you asked on 2026-09-29:

- **The small-print line is removed.** *"Experience gained through various
  suppliers; these are not AR7 Traders sales totals."* no longer appears
  anywhere on the site. (On the home page and the About page it was actually
  showing *larger* than the label above it.)
- **The label is enhanced.** It used to be tiny grey small print. Now
  **cars sold** sits in bold right beside the number, a thin gold line
  separates the two, and the supporting line — *"Dozens of satisfied
  customers, including car businesses."* — is a readable size, with
  **satisfied customers** and **car businesses** picked out in the brand
  green. Your words are unchanged; the only edits are a capital "D" and a
  comma, because it now starts its own line.
- **900+ is animated.** The first time the number scrolls into view it counts
  up from 0 to 900. The gold line and the label slide in beside it, and as the
  count lands the gold **+** pops in with a soft glow while a gold glint sweeps
  across the digits. In the hero it waits for the page's opening animation
  first. It plays once each time the page is opened.

Visitors who have "reduce motion" switched on in their phone or computer
settings see the finished 900+ straight away, with no animation. Screen
readers and search engines always get the real "900+" in the page text, never
a half-counted number.

`CLAIMS-POLICY.md` §1 now records this decision.

---

## 20. Dark mode: the "Japan to everywhere" heading is readable again

**Home page, the "Japan to everywhere" section.**

That section keeps its light background even when the site is in dark mode,
but its heading and its small green label were switching to dark-mode colours
— near-white and pale green on a light background, so "Japan to" had all but
disappeared (contrast 1.09:1; comfortable reading needs at least 4.5:1). Both
now keep their normal dark colours on that light band (14.3:1 and 10.1:1),
exactly as in light mode. Light mode itself is unchanged, and a check of every
piece of text on the home and About pages found no other dark-mode-only
problems.

---

## Suggested first ten minutes

1. Run the SQL in Supabase.
2. Open the CRM → **Team**. Set what Sales and Accounts may do. Untick *Delete
   records directly* for anyone who should ask first.
3. Open **Website**. Put your real email, phone and WhatsApp number in. Save.
4. Look at the website — the footer, contact page and WhatsApp button should all
   show your new details.
5. Open **Accounts**, pick a customer, press **Create login**, then **Open their
   account** to see the portal exactly as they will.
