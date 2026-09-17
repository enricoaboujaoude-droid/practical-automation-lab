# PAL Catalog Check — submission state

Current stage: **CLEAN PRODUCTION ENDPOINT VERIFIED + APP STORE PRE-SUBMISSION**

Issue: #5 — Approved build brief: PAL Catalog Check for Shopify

## Canonical identity

- Partner organization: **Practical Automation Lab**
- public/admin app name: **PAL Catalog Check**
- distribution: **Public distribution selected**
- canonical Partner-owned Shopify app: PAL Catalog Check
- development store: **PAL Feed Health Dev** (`pal-feed-health-dev.myshopify.com`)
- development-store naming is a legacy internal test identifier, not the public app brand

Earlier merchant-organization app identities are not canonical and must not be used for credentials, release, or submission.

## Current verified production state

- released Shopify version: **`pal-catalog-check-5`**
- production application URL: **https://pal-catalog-check-app.onrender.com**
- production OAuth redirect: **https://pal-catalog-check-app.onrender.com/auth/callback**
- embedded application mode enabled
- Shopify access scope: **`read_products` only**
- mandatory privacy-compliance subscriptions declared
- clean endpoint is live on Render Free in Frankfurt
- Node runtime pinned and verified at **22.22.0**
- same dedicated Neon `pal_shopify_sessions` database retained
- fresh offline Shopify session created on the clean endpoint and persisted in Neon
- fresh session scope verified as `read_products`
- real catalog scan repeatedly passed after cutover: **17 products, readiness score 62**
- two controlled post-cutover rescans both returned HTTP 200 and the same 17/62 result
- embedded `/app` returned HTTP 200
- legacy Render endpoint received no traffic during the controlled post-cutover verification window
- request logging remains hardened against signed Shopify query parameters
- review surface remains limited to implemented free/read-only functionality
- public privacy/support resources remain live and branded PAL Catalog Check
- 1200×1200 text-free app icon prepared
- latest Shopify CI passed dependency audit, DB check, tests, TypeScript typecheck, and production build

## Webhook verification

The earlier credential/app-identity transition produced temporary lifecycle webhook failures, followed by successful Shopify retries on the stabilized app. After the clean endpoint cutover, no new lifecycle event has yet been intentionally triggered on the new endpoint. The released configuration still declares `app/uninstalled`, `app/scopes_update`, and the three mandatory privacy-compliance topics.

Before submission, verify Shopify's automated checks recognize these released subscriptions and resolve any failed webhook/compliance check.

## Current commercial state

- external merchants: not yet proven
- genuine Shopify beta-interest events observed in the latest verification window: 0
- revenue: $0
- paid plan: not active
- App Store registration fee: not yet paid

## Owner publication authorization

The owner authorizes the current one-time Shopify App Store registration fee up to **$19 USD** only when all autonomous/no-cost preparation is complete, the app is otherwise ready for review, and that fee is the final meaningful blocker.

No other pre-revenue spend is authorized. Recovery is a target, not a guarantee.

## Remaining launch gates

1. remove the obsolete **PAL Feed Health** legacy installation from the development store only after confirming PAL Catalog Check remains healthy
2. keep the old Render service as temporary rollback infrastructure until final pre-submission validation is complete; do not delete it prematurely
3. confirm required Partner/App Store contact fields
4. upload/confirm the 1200×1200 icon
5. capture real embedded-app screenshots
6. record the real review screencast
7. run Shopify automated pre-submission checks and resolve every failure
8. use the conditionally authorized one-time registration fee only if it is then the final meaningful blocker
9. submit for App Store review
10. keep Issue #5 open until genuine external/public launch
11. after publication, measure installs, first scans, repeat scans, commercial intent, retention, and eventual paid revenue

## Parallel operating rule

Do not wait passively for review or demand. Keep improving reliability, onboarding, discovery, measurement, and merchant value while Opportunity Hunter continues researching higher-ceiling or complementary opportunities. Keep the portfolio at no more than five active automations.
