# Security and feature review — 16 November 2026

## Scope and status

This is a targeted, non-destructive review, **not a complete penetration test or a live walkthrough of every feature**. Code was inspected at main `41f5f47`, and local tests use injected fakes rather than real customer accounts. No production records, roles, settings or messages were changed by this review. Changes in this branch are **not deployed** until merged and promoted.

## High-priority finding: account shipment association

The production code associates account shipments using `customer_name`, which is not a unique or immutable customer identifier. Customers can edit their own profile name, and a common name can match other customers' shipments. The response contains logistics and tracking information. This is a code-confirmed authorization design flaw; no real customer account was used to exploit it and no assertion is made about past exploitation. The shipments table currently has no `customer_id` column, according to read-only production schema metadata.

Branch mitigation: do not associate account shipments by name. The public tracking-number lookup remains available; the account shipment section will be empty until a safe customer-ID-based association is designed, migrated and populated by authorized staff. This is an intentional functionality tradeoff, not a deletion of shipment records. Expedite review/deployment and review relevant access logs if available.

## High-priority hardening: customer record linking

The account code auto-links unlinked CRM customers using an email lookup without explicitly checking `email_confirmed_at`, does not escape SQL LIKE wildcards, and returns a candidate even if linking fails. A concurrent link can overwrite another claimant. The production Supabase Auth configuration currently has email auto-confirm off and unverified email sign-in disabled, which mitigates some scenarios but does not make the application checks unnecessary.

Branch mitigation: require confirmed email, escape wildcard characters, require exactly one exact email match, condition the write on the record still being unlinked, and return no customer when linking fails. Ambiguous duplicate CRM emails require staff review. Local tests cover unconfirmed, wildcard, duplicate, failed and concurrent link scenarios; these are not production exploitation tests.

## Customer data minimization

Account orders previously returned every column in `order_balances`, including staff notes and internal identifiers. The branch limits the selected and serialized order data to fields used by the customer portal; payment fields remain explicitly shaped. Tests cover cross-customer isolation and exclusion of internal fields using local fakes.

## Other observations

- Public tracking uses the tracking number as the only credential, so weak or sequential numbers may be guessable. Rate limiting, high-entropy tracking tokens, and a privacy review are recommended before treating it as confidential. This review did not enumerate tracking numbers or conduct a load test.
- Saved-search stock loading still uses a separate unpaginated database query, and `seen_refs` retains only 800 references. At greater catalogue sizes this may miss stock or repeat alerts. Redesign the alert state before increasing that scale; no alerts were sent in this review.
- Japan-stock paging uses offsets and is not a transactional snapshot; a concurrent sync can shift results across pages. It has an explicit 10,000-row ceiling. Cursor/snapshot-backed paging and sharded sitemaps remain future work.
- At review time, production `anon` and `authenticated` had no `UPDATE` column privileges on `profiles` (read-only metadata check). This does not establish that all database grants, policies, and service-role endpoints are safe.
- Prior PR #182 is present in a READY/PROMOTED production deployment according to Vercel metadata. The live Prius model URL and an individual Prius detail URL rendered, and invalid stock pagination and anonymous staff/account requests returned error bodies. These limited observations do not verify Google indexing or all user flows.

## Automated checks on the branch

- `npm test`: passed on Node 22, including CRM authorization, customer login, SEO, inventory, importers, and new account isolation tests.
- `npm run build`, `npm run build:crm`, and `npm run guard`: passed; Guardian 18/18.
- `npm audit --omit=dev`: zero known production-dependency vulnerabilities reported at check time.
- Local tests do not substitute for testing live authentication, real email delivery, database row-level policies for all identities, browser layout, or third-party services.

## Remaining walkthrough / penetration-test plan

Use an isolated staging deployment and dedicated test identities/data for CEO, non-CEO admin, staff roles, two separate customers, unconfirmed users, and unauthenticated visitors. Check object-level access across customers, orders, payments, shipments and saved searches; test role changes, login-as restrictions, session expiry, CSRF/CORS, XSS, input validation, public form abuse/rate limits and file upload boundaries. Walk every public and CRM feature in real desktop/mobile browsers, including keyboard, zoom, RTL and screen-reader checks. Exercise emails, payments, imports and integrations only with explicit test destinations and safe fixtures. Verify backups with an isolated restore and review production authentication/access logs. Do not submit real enquiries, send customer messages, alter live roles, or conduct destructive/load tests against production as a substitute for staging.
