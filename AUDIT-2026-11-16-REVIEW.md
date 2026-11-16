# AR7 Traders audit — 16 November 2026

## Scope and important limitations

Read-only review of the repository and selected live infrastructure metadata. This is a prioritized audit, not a penetration test, full visual review, or proof that all production flows work. No production data or configuration was changed. The review covered the codebase as represented by the workspace and main commit `d082062` (the latest commit is a Guardian report update), CI/workflow status, Vercel project metadata, and Supabase health and selected database security metadata. Tests and build were run in the preceding review; CRM preview build and dependency audit were run in this review.

## Findings

### Critical — profile role can apparently be self-updated

Production database metadata shows that `authenticated` has UPDATE privileges on `public.profiles.role` and `active`; the `staff update own profile` RLS policy allows a user to update their own row and checks only `id = auth.uid()`. No `profiles` triggers were returned by `information_schema.triggers`. The API reads `role` and `active` from this table (`api/_supabase.js:9`), and `api/_perm.js:88` grants admin full permissions. Taken together, these facts indicate that a signed-in user with a profile could change their own role to `admin` or reactivate their account. This was **not exploited or tested by changing a live account**; assess any additional database rules before concluding the actual exposure.

**Priority:** immediate security review. Restrict self-service updates to safe profile fields, preserve a controlled admin/service-role path for team management, update both production and setup/migration SQL, and add regression tests for direct Supabase access and API permissions. Review account activity and roles as appropriate. Do not blindly disable profile updates without checking existing staff flows.

### Medium — Guardian fails on canonical check

The latest committed Guardian report shows 17 passes and one failure: `dist/index.html` lacks a static canonical. Local `npm run build && npm run guard` reproduced this. `index.html:120–127` deliberately omits a homepage canonical from the shared SPA shell; `src/seo.js` supplies route-specific tags at runtime, while other routes are prerendered. The Guardian check (`scripts/guardian.mjs`, SEO section) scans all HTML and does not account for that distinction. Recent GitHub Guardian runs are failing; recent normal CI runs are successful. The SEO audit also passed. This is a monitoring failure, not evidence that all live canonical tags are wrong. Verify crawler responses for each route class before adjusting the check or canonical strategy; do not simply add a homepage canonical to the shared shell. GitHub workflow log retrieval was blocked by network access, so the exact workflow failure was not independently confirmed from its logs.

### Medium — working branch baseline is stale

Correction to the preceding message: the earlier fast-forward did not persist as the branch's Git HEAD between turns. Current HEAD is `d616732` (PR #80 era), while the workspace files match the local `main` tree at `d082062` apart from this report. The changes therefore appear as a large working-tree patch against an older base rather than a clean branch at main. This is a significant PR/regression risk if treated as new work. Preserve the workspace, reconcile the branch baseline safely before making a PR, and re-check current remote main at that time. Do not discard the apparent changes with a reset or restore.

### Low / verification — Node runtime mismatch

CI uses Node 22 and `package.json` specifies `22.x`; Vercel project metadata reports Node 24.x. Production is READY and promoted, so this is not currently proof of a failure. Align or explicitly test the deployment runtime, particularly native dependencies, before making changes. Local site and CRM builds used Node 22.

### Low / performance — large translation chunk warning

The production build succeeded but warned about a minified translation dictionary chunk over 500 kB (approximately 637 kB raw / 207 kB gzip). It is lazy-loaded and the first-load bundle budget passed, so this is not a first-paint budget failure. Measure actual language-switch and mobile network performance before optimizing; retain all 15 languages and RTL behavior.

## Positive checks

- `npm test`: passed in the preceding review, including CRM authorization, routing, importers, SEO, accessibility-related and workflow tests.
- `npm run build`, `npm run seo`, `npm run test:bundle`, and `npm run test:i18n-switch`: passed in the preceding review; Guardian exception above.
- `npm run build:crm`: passed in this review. `npm audit --omit=dev`: zero reported vulnerabilities at audit time.
- Recent GitHub Actions statuses: main CI, Goo-net importer, machinery importer and prospect radar reported success; the Guardian repeatedly reported failure. A successful scheduled run does not by itself prove data freshness or every downstream integration.
- Vercel project metadata: latest production deployment READY and PROMOTED with the public domain assigned.
- Supabase AR7crm: database, Auth, REST, and Storage health checks reported healthy. All 35 public tables observed had RLS enabled. This is not proof that policies and privileges are safe; see critical finding above. Policy metadata returned two policies, both on profiles.
- Twelve top-level API functions are present; maintain the existing function-count constraint.

## Architecture / regression boundaries

- Header geometry and lifecycle are owned by `src/site-layout.css` and `src/site-header.jsx`; preserve responsive layout and dynamic offsets.
- Public routes, deep-link refresh behavior, vehicle/machinery crawler rendering, language URLs, hreflang, staff noindex rules, and sitemaps are interconnected. Preserve these when changing SEO or routing.
- Machinery publishing defaults, supplier-price markup, photo rights and watermark handling must be preserved; do not invent stock specifications or claims.
- CRM permissions, customer data and approval workflows, Goo-net/machinery imports, WhatsApp, and draft-only AI automation require special care. Keep secrets server-side.
- Preserve the documented claims policy and pricing qualification; test mobile layouts, RTL, overlays, and critical buyer flows before shipping changes.

## Not verified

No full browser walkthrough on desktop and mobile, real-user accessibility testing, live form submission, end-to-end CRM role test, real import, outbound message, Search Console inspection, backup/restore test, or complete security penetration test was performed. No claim is made that every prior PR or every production integration is defect-free. Production metadata and statuses are point-in-time observations.

## Remediation and additional security review

- **Live mitigation applied:** Supabase migration `restrict_profile_direct_updates` removed the unsafe profile self-update policy and revoked direct UPDATE from `anon` and `authenticated`. Read-only metadata checks returned no such policy and no UPDATE column privileges afterward. Staff profile edits continue through the existing server API; no account or business records were modified.
- **Branch changes, not yet deployed:** team invitation, role/status edits, permission changes and staff password resets now require the verified CEO Auth email and an active admin profile. The UI reflects this restriction. Tests include non-CEO admin denial, unconfirmed CEO denial and permitted CEO/own-profile actions.
- **Additional critical finding:** customer `login-as` previously generated a magic link for an editable customer email, allowing an authorized operator to target a staff identity. Branch code now requires a confirmed, linked Auth account whose email matches and whose ID has no staff profile; customer password and reset actions use the same verification. Regression tests cover unlinked, mismatched, unconfirmed and staff identities and the endpoint's refusal to generate a link. **Until this branch is deployed, the live customer login-as endpoint remains vulnerable and other admins can still manage team roles.** Treat the deployment as urgent; restrict access operationally in the meantime.
- Guardian distinguishes the shared runtime shell from prerendered canonical tags and rejects a static canonical on that shell. Its regression tests cover both positive and negative paths; local Guardian passes 18/18.
- Node 22 and Node 24 are now covered by the CI matrix. Full automated tests passed separately on both local runtimes; production build also passed on Node 24. `npm audit --omit=dev` found zero known vulnerabilities at audit time.
- Branch baseline was reconciled locally to main commit `d082062`, preserving the workspace and audit report. Recheck branch HEAD, remote main and the diff before any PR because the session previously restored an older Git baseline between turns.

### Remaining security work and limitations

This was not a complete penetration test or a live walkthrough of every feature. It included targeted, non-destructive authorization review and local test doubles, not authenticated production exploitation, end-to-end sign-in, or real customer transactions. The outbound network restrictions and lack of an authenticated browser/test accounts limit live inspection. Do not simulate orders, send real messages, rotate passwords, or alter roles on production just for testing. Use a separate staging environment and explicit test identities for a full role-by-role walkthrough, negative access-control tests, public form abuse and rate limiting checks, mobile/desktop accessibility, and third-party integration tests. Review staff access and sign-in logs for unauthorized role or customer-impersonation activity; use MFA for the CEO account. Assess backup recovery and restore drills. Review the customer-dashboard read authorization and least-privilege matrix in a dedicated follow-up rather than assuming automated tests prove confidentiality. Measure the large lazy translation chunk on representative mobile devices before changing translations.
