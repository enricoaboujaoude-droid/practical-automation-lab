# PAL Catalog Check — submission state

Current stage: **PARTNER APP MIGRATION VERIFIED + PRE-REVIEW URL REMEDIATION**

Issue: #5 — Approved build brief: PAL Catalog Check for Shopify

## Canonical identity

- Partner organization: **Practical Automation Lab**
- public/admin app name: **PAL Catalog Check**
- distribution: **Public distribution selected**
- canonical Partner-owned Shopify app: PAL Catalog Check
- development store: **PAL Feed Health Dev** (`pal-feed-health-dev.myshopify.com`)
- the development-store name/domain are legacy internal test identifiers and are not the public app brand

The earlier merchant-organization app identities are not canonical and must not be used for credentials, release, or submission.

## Current verified product state

- Partner-owned app credentials active in GitHub Actions and Render
- Shopify production config released successfully as `pal-catalog-check-4`
- embedded application mode enabled
- Shopify access scope: `read_products` only
- production OAuth redirect configured
- mandatory privacy-compliance subscriptions declared
- clean uninstall/reinstall passed on the development store
- fresh offline Shopify session created and persisted in dedicated Neon Postgres
- real catalog scan passed after migration: 17 products, readiness score 62
- embedded `/app` returned HTTP 200
- repeated scan behavior was previously validated at the same 17/62 result
- request logging hardened to avoid signed Shopify query parameters
- review surface limited to implemented free/read-only functionality
- public privacy/support resources live and branded PAL Catalog Check
- factual App Store listing brief present
- 1200×1200 text-free app icon prepared
- public PAL Catalog Check acquisition page live
- latest Shopify CI passed production dependency audit, database schema check, tests, TypeScript typecheck, and production build

## Webhook verification

During the credential/app-identity transition, `app/scopes_update` and `app/uninstalled` deliveries initially returned HTTP 500. A subsequent Shopify retry of `app/uninstalled` returned HTTP 200 after the migration settled. Do not treat the transition-time 500s as an unresolved uninstall-handler failure. Re-check lifecycle/compliance webhook status again before submission.

## Current commercial state

- external merchants: not yet proven
- genuine Shopify beta-interest events observed in the latest verification window: 0
- revenue: $0
- paid plan: not active
- App Store registration fee: not yet paid

## Owner publication authorization

The owner authorizes the current one-time Shopify App Store registration fee up to **$19 USD** only when all autonomous/no-cost preparation is complete, the app is otherwise ready for review, and that fee is the final meaningful blocker.

No other pre-revenue spend is authorized. Recovery is a target, not a guarantee.

## Current blocker — fix before App Store submission

Shopify's current App Store submission guidance says application domains must not contain the word `Shopify` or `Example`.

The existing Render runtime uses the legacy hostname:

`https://pal-shopify-feed-health.onrender.com`

This hostname is functionally healthy but should not be submitted for App Store review. The existing Render service must be **renamed in place** to a neutral PAL Catalog Check name; do not create a new workspace or service.

After the Render rename, update and verify:

1. Render runtime app URL environment value
2. `shopify.app.toml` application URL and OAuth redirect URL
3. Shopify released app configuration
4. development-store reinstall/authentication
5. durable Neon session persistence
6. real catalog scan
7. lifecycle/compliance webhook responses

## Remaining launch gates after URL remediation

1. confirm required Partner/App Store contact fields
2. upload/confirm the 1200×1200 icon
3. capture real embedded-app screenshots
4. record the real review screencast
5. run Shopify automated pre-submission checks and resolve every failure
6. use the conditionally authorized one-time registration fee only if it is then the final meaningful blocker
7. submit for App Store review
8. keep Issue #5 open until genuine external/public launch
9. after publication, measure installs, first scans, repeat scans, commercial intent, retention, and eventual paid revenue

## Parallel operating rule

Do not wait passively for review or demand. Keep improving reliability, onboarding, discovery, measurement, and merchant value while Opportunity Hunter continues researching higher-ceiling or complementary opportunities. Keep the portfolio at no more than five active automations.
