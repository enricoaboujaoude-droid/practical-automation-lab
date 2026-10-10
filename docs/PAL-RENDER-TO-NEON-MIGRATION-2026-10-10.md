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
