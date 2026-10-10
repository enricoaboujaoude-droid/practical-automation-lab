# PAL Render → Neon migration checkpoint — 2026-10-10 UTC

Scope: Practical Automation Lab only; do not modify Kalikora.

## Current inventory
- Render: nine services including the public static website, event collector, commercial APIs, risk APIs, and Shopify/Catalog Check applications.
- Render PostgreSQL: `pal-feed-auditor-events-db` (`dpg-dalofigu01pc73fomu7g-a`), free service reported expiration **2026-10-17**.
- Neon: project `gentle-hill-72820021`, production branch `br-wild-truth-b2gxc5zl`, database `pal_shopify_sessions`; nine deployed function slugs `palmain`, `palcatalog`, `palcatapp`, `palfull`, `palnano`, `palmarket`, `palbazaar`, `palrisk`, `palevents`.
- **Do not treat deployed functions as necessarily independent of Render.** Proxy functions may rely on Render origins and may time out.

## Verified this run
- Neon PostgreSQL schema: 18 PAL tables. Read-only database counts as observed: `pal_feed_auditor_events=100` (90 test events), `CatalogScan=28`, `Session=5`, `ScheduledReport=6`, `pal_nano_payment_use=5`, `pal_paddle_webhook_events=1`, `pal_fastspring_webhook_events=1`. Latest event timestamp: `2026-10-10T10:40:30Z`.
- Neon `palevents` function: new native collector bundle deployed as deployment #5 (completed); `/health` returned `{"ok":true}`, and a test event appeared in the database. Its CORS/Origin policy now explicitly permits **only** the existing Render static-site origin and Neon palmain origin (rather than permitting everyone).
- Neon `palmarket` `/api/health`: returned runtime `neon-native`; `palrisk` and `palbazaar` `/health` returned OK.
- Neon `palmain` page returned HTML; it is not proof of independent frontend hosting.
- `palnano`, `palfull`, `palcatapp`, `palcatalog`: external GET probes timed out in the final batch. Do not cut over those production endpoints until native workloads and payment behavior are validated.
- Live Render static site `https://practical-automation-lab.onrender.com/pal-analytics.js` was checked externally and contains the new Neon collector URL.

## Applied changes
- `collector/server.js`: transitional dual-origin allowlist, including all 11 browser-origin checks and CORS header.
- `pal-analytics.js`, `product-feed-preflight.html`, `shopify-store-audit.html`, `checkout-success.html`, `commercial-interest.html`: collector calls changed to `https://br-wild-truth-b2gxc5zl-palevents.compute.c-6.eu-central-1.aws.neon.tech`.
- Public Render static service redeployed successfully to commit `140b2945d106401a1b42b5ade1f58c119737dd57`. Render collector also redeployed to the same commit as a rollback route.
- Relevant commits: `418116b66afa9c7fbd4a5adb96a49dc7a81683f0` (dual-origin collector), `ae4e7659b0f347fd75026a95df4c637419a36ed5` (analytics), `d9866e2c7abbb1ab6feea71eabab8e5be384b0f2` (preflight), `0bf4165fc2405c512baa9191bd9449a10e0255ea` (store audit), `6fe5016c6cbc4661fe69e418878f1e83fd777ef8` (success page), `140b2945d106401a1b42b5ade1f58c119737dd57` (commercial-interest).

## Blocking conditions before final retirement
1. **Render DB parity**: Render hosted database blocks MCP SQL reads because its IP allowlist is empty. Neon has migrated data, but counts/digests cannot yet be compared. Export or trusted local read-only access is needed before old Render Postgres expiration. Never delete the source before full parity and webhook replay checks.
2. **Native commercial workloads**: implement/qualify independent Neon logic for paid catalog remediation, Nano, and the Shopify app. Present Neon versions of the four currently timing-out functions may be proxies only. Preserve verified x402 price, pay-to wallet, settlement verification, and published listing IDs. Avoid duplicate registrations or accidental new pricing.
3. **Front-end hosting**: Neon Functions are for backend/API logic, not a substitute for general static-site hosting. Existing Vercel integration sees GitHub namespace `enricoaj` only, while PAL repo is `enricoaboujaoude-droid/practical-automation-lab`. A separate authorized commercial-friendly static host or repo integration is needed; do not move to a paid tier under the $0 pre-revenue rule. Keep the Render static site functioning meanwhile.
4. **External callbacks**: keep live payout, payment webhook, affiliate, published listing and Shopify callback URLs stable until verified independently against Neon.
5. **Cutover safety**: only after endpoint parity (GET/POST, 402 challenge, payment settlement, CORS, webhook verification and idempotency), change canonical URLs and callback registrations; monitor, then deactivate legacy Render resources after a rollback period. Do not destroy data or paid account artifacts.

## Runbook and rollback
- Check Neon `palevents/health` and read-only count of `pal_feed_auditor_events`; check public site `pal-analytics.js` includes `palevents`.
- A collector rollback is possible by replacing the website's collector URL with `https://pal-feed-auditor-events.onrender.com` and publishing; Render collector is still deployed with dual-origin support. Avoid rollback unless failure confirmed.
- Preserve this checkpoint when continuing migration; progress does not establish customer payments or source-target database equality.


## Continuation update — same day, 11:15 UTC

### Actual Render-source reconciliation
- Connected Render collector confirmed its `DATABASE_URL` points to Render PostgreSQL.
- Read-only inventory of **all 9 Render collector tables** obtained via startup logs without exposing rows or credentials.
- Original source snapshots are copied privately and idempotently into Neon `public.pal_render_migration_stage`; staged source has `104` event rows, `1` Paddle webhook, and `1` FastSpring webhook at the last observed transfer. Other source tables were empty.
- `pal_feed_auditor_events`: the initial two missing events and later one additional missing event were **all test records**, not live customer events. They were inserted using source IDs and the Neon sequence safely advanced. At the last check, Neon live count was aligned to the staged snapshot.
- Historical timestamp values are **not identical** between all matching Render and Neon event rows, although other checked payload fields matched. Original Render timestamps remain preserved in staging; preexisting Neon timestamps were not overwritten. Payment webhook payload differences also concerned time fields (as observed), and original records are preserved.
- Render collector code now refreshes stage snapshots every 15 minutes **while its instance is running**, with source row reads capped at 20,000 per table and idempotent target upserts; startup also runs a snapshot. A GitHub six-hour smoke check hits the Render source health route so sleeping services are periodically awakened, but it is not a transactional CDC guarantee.
- All database-copy activity is private database-to-database, not a public export route or GitHub attachment.

### Operational remediation and security
- Neon collector initially returned HTTP 502 after the Neon platform started injecting `DATABASE_URL` for a newly created API role `pal_render_migration_writer` into the function. It lacked the required public-schema CREATE privileges, causing function initialization to fail.
- Neon collector deployment **#7** explicitly overrides `DATABASE_URL` with the proper `pal_shopify_app` application-role connection; Neon logs confirmed the actual SQL role and `/health` recovered to HTTP 200.
- Render public frontend was temporarily rolled back to the working Render collector while this was repaired. Afterwards, `pal-analytics.js` was changed to Neon-primary with best-effort Render fallback **only for analytics events**, not for payment or checkout operations.
- A **separate SQL-created limited role** `pal_render_staging_limited` now has `SELECT, INSERT, UPDATE` on migration staging only; Neon inspection confirmed it does not inherit `neon_superuser` and cannot write live event tables. Render collector was reconfigured with that credential; subsequent `PAL_MIGRATION_STAGE_COMPLETED` logs validated the transfer.
- The temporary API-created elevated migration role `pal_render_migration_writer` was **deleted** after the limited credential was proven working.
- Existing Render collector and legacy customer-facing checkout/form routes remain operational to avoid interrupting payment provider callbacks.

### Continuity and frontend hosting
- New workflow `.github/workflows/pal-neon-continuity.yml` runs on pushes/manual requests and on a 6-hour schedule. Its first run passed. It checks Neon collector, marketplace, risk API, allowed and disallowed CORS origins, unpaid x402 payment challenge, and now additionally Render fallback and the published analytics script. No paid calls.
- GitHub Pages static-site deployment workflow `.github/workflows/pal-github-pages.yml` was created, with public-file allowlisting; the action build prepared content but **failed to enable GitHub Pages** because `GITHUB_TOKEN` lacks Pages-site creation permission. Enabling `enablement: true` did not overcome the restriction.
- Vercel project creation under the linked `Lebshop` team failed HTTP 403 (repository/source authorization). Hatchable existing account lists only personal projects, which require visitors to log in; unsuitable for public merchant marketing without an approved visibility solution.
- **Owner action:** GitHub repository `enricoaboujaoude-droid/practical-automation-lab` → Settings → Pages → Build and deployment → Source: **GitHub Actions** → Save. Then re-run the `PAL static site — independent hosting` workflow. Do not change production DNS/origins until the GitHub Pages site and checkout pages pass real browser tests.
- Render original free Postgres expiry remains **2026-10-17T06:25:14Z**. Before retiring Render, inspect source/target row differences, verify latest payment provider webhooks, customer entitlements and callback URLs, and qualify direct Neon-native catalog/Nano/Shopify implementations. Do not delete source prematurely.

### Important boundaries
- The nine Neon function slugs exist, but not all are native or passing readiness checks. `palfull`, `palnano`, `palcatapp`, `palcatalog` experienced external timeouts. Keep paid production traffic on known-working Render endpoints until their independent Neon equivalents are qualified.
- Staging is a *quarantine/reconciliation copy*, not proof that every record has been merged into live Neon tables. Do not automatically grant the staging writer access to live payments or backfill webhooks without provider-verification and idempotency review.
- Do not report test events, payment handshakes, or zero-charge challenges as earned customer revenue.
