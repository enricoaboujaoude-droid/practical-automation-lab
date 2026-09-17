# Shopify App Store submission brief — PAL Catalog Check

Status: **pre-submission working draft**. Keep every claim limited to functionality that is live and tested.

## Canonical app identity

- Partner organization: **Practical Automation Lab**
- public/admin app name: **PAL Catalog Check**
- distribution: **Public distribution selected**
- current Partner-owned released version baseline: `pal-catalog-check-4`
- development store: **PAL Feed Health Dev** (`pal-feed-health-dev.myshopify.com`)

Earlier merchant-organization app identities are not canonical and must not be used for credentials or submission.

## App name

**PAL Catalog Check**

The name accurately describes the current read-only product and avoids promising future monitoring/feed publishing. Re-check exact App Store name availability immediately before submission.

## Current pre-review URL blocker

Shopify's current submission guidance says application domains must not contain the word `Shopify` or `Example`.

The existing working Render application URL is the legacy hostname:

`https://pal-shopify-feed-health.onrender.com`

Do **not** submit that hostname for review. Rename the existing Render service in place to a neutral PAL Catalog Check name; do not create a new workspace or service. Then update the runtime app URL, `shopify.app.toml` application URL/OAuth redirect, release a new Shopify configuration version, reinstall, and retest before continuing with submission.

## Owner App Store registration authorization

Shopify currently documents a **one-time $19 USD App Store registration fee per Partner account**. The owner has conditionally authorized this fee **up to $19 USD one time**, but only when all autonomous/no-cost preparation is complete and the fee is the final meaningful blocker to review submission.

This authorization does not permit any other pre-revenue spend. Fee recovery is a target, not a guarantee.

## App card subtitle

**Find catalog issues before they become product-feed problems**

## Short positioning

PAL Catalog Check is a read-only Shopify catalog-readiness scanner. It reviews product and variant fields that commonly create feed-preparation problems and gives merchants clear remediation guidance without editing their catalog.

## App details draft

PAL Catalog Check helps merchants review product data before relying on it in shopping and product-feed workflows. The embedded app reads catalog fields directly through Shopify's GraphQL Admin API and groups findings into critical issues and warnings.

The scan checks product titles, vendor/brand presence, Online Store URLs, product images, image dimensions when Shopify provides them, variant identifiers, prices, and duplicate option combinations. Each finding includes a practical remediation note so merchants can decide what to change in Shopify.

The app is intentionally read-only. It does not edit products or variants, does not request customer or order access, and does not claim to guarantee approval by Google Merchant Center or any other sales channel.

Current scan boundaries are explicit in the UI: up to 2,500 products, up to 100 variants per product, and up to 20 images per product. The app warns when a boundary is reached.

## Feature bullets

- Scan Shopify catalog data for missing or risky product-feed fields
- Flag missing images, non-positive prices, and duplicate variant options
- Review vendor/brand, Online Store URL, and identifier gaps
- Warn when observable image dimensions are below the readiness target
- Get remediation guidance without allowing the app to edit products

## Pricing at initial public launch

**Free**

Do not advertise Pro, Growth, Agency, subscriptions, trials, or paid capabilities until those capabilities and Shopify App Pricing are implemented and review-ready.

## Primary category

Candidate: **Product feeds**

Confirm current category availability/fit in the submission form immediately before submission.

## Search terms

Use only if accepted by the current listing form:

- product feed
- catalog audit
- merchant center
- feed errors
- product data

Do not keyword-stuff the subtitle or app name.

## Language

English only at launch.

## Integrations / works-with claims

Do **not** claim a direct Google Merchant Center integration. The app provides readiness guidance but does not connect to a merchant's Merchant Center account.

## Shopify API access

- `read_products`
- GraphQL Admin API for the catalog scan
- no customer scopes
- no order scopes
- no product write scopes

## Merchant-facing resource URLs

Product / beta page:
https://practical-automation-lab.onrender.com/shopify-catalog-check.html

Privacy policy:
https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html

Support:
https://practical-automation-lab.onrender.com/shopify-feed-health-support.html

Developer website:
https://practical-automation-lab.onrender.com/

The legacy words in the privacy/support **file paths** are not the app brand; the page titles and content are branded **PAL Catalog Check**. The application runtime domain itself must be neutral before submission.

## Verified runtime behavior baseline

Before the application-domain rename, the Partner-owned app passed:

- clean install/reinstall on the development store
- embedded app authentication
- fresh offline access-token/session creation
- durable session persistence in dedicated Neon Postgres
- `read_products` scope
- real catalog scan: 17 products, readiness score 62
- embedded `/app` HTTP 200
- CI: dependency audit, DB check, tests, TypeScript typecheck, production build
- lifecycle webhook recovery: a post-migration `app/uninstalled` Shopify retry returned HTTP 200

Repeat these critical checks after the application-domain rename.

## Review instructions draft

1. Install the released PAL Catalog Check app on the review store.
2. Open the app from Shopify Admin.
3. The embedded dashboard authenticates through Shopify and runs a read-only catalog scan.
4. Review the readiness score, critical findings, warnings, and remediation notes.
5. Use **Rescan catalog** to verify repeat scanning.
6. Open **Support** to review scan boundaries and data-handling links.
7. The current free app does not require external account credentials, Merchant Center credentials, or payment information.

Expected behavior on an empty or clean test catalog: the app can return no findings. This is valid and should not be treated as an error.

## Demo screencast checklist

The review screencast should show:

1. opening PAL Catalog Check from Shopify Admin
2. embedded dashboard loading successfully
3. the scan result summary
4. one or more finding/remediation rows if the test catalog contains them
5. clicking **Rescan catalog**
6. opening **Support**
7. showing that the app never edits a product

Do not include passwords, access tokens, Shopify signed query parameters, private API credentials, or unrelated projects.

## Listing image checklist

Prepared icon asset:
`shopify-feed-health-app/listing-assets/pal-catalog-check-icon-1200.png`

Submission controls:
- app icon: 1200×1200 PNG or JPEG
- no text inside the icon
- no Shopify trademark inside the icon
- use real screenshots of the actual embedded app UI
- each screenshot should show a different useful feature/view/state
- do not include fabricated UI, testimonials, unsupported statistics, guarantees, or pricing claims in screenshots

## Privacy-compliance checklist

The released configuration declares:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

All three use `/webhooks/compliance`. The app also declares lifecycle subscriptions for `app/uninstalled` and `app/scopes_update`.

Before submission, re-run lifecycle/compliance verification after the application-domain migration and confirm Shopify's automated checks recognize the released subscriptions.

## Contact prerequisites

Before submission, confirm all required Partner/App Store contact fields are valid:

- API contact email
- merchant support email
- emergency developer contact
- app submission/review contact email

Do not expose credentials or private project data in any public field, screencast, listing asset, or review note.

## Remaining account-level submission actions

After the application-domain rename/retest:

1. confirm final required contact fields
2. upload/confirm the prepared app icon
3. capture/upload real embedded-app screenshots
4. record/upload the real demo screencast
5. run Shopify's automated pre-submission checks and resolve every failure
6. register/pay the conditionally authorized one-time App Store fee only if it is the final meaningful blocker
7. submit for review

Issue #5 stays open until genuine external/public launch.

## Commercial boundary

Initial public launch is free. Paid-plan validation can continue outside the review surface. Add Shopify App Pricing only when paid functionality is actually implemented and authorized.
