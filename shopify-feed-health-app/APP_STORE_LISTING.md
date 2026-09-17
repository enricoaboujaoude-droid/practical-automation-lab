# Shopify App Store submission brief

Status: pre-submission working draft. Keep claims limited to functionality that is live and tested.

## Working public name

**PAL Catalog Check**

Reasoning:
- leads with the Practical Automation Lab brand identifier (`PAL`)
- stays under Shopify's recommended 20-character admin-navigation length
- avoids the already-live `FeedHealth` and `Feed Sentinel` naming space
- accurately describes the current read-only product instead of promising future monitoring or feed publishing

Re-check name uniqueness in the Shopify App Store immediately before submission. Do not reserve or release the name until the rest of the submission package is ready.

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

Do not advertise Pro, Growth, Agency, subscriptions, trials, or paid features until those capabilities and Shopify billing are actually implemented and review-ready.

## Primary category

Candidate: **Product feeds**

Confirm category availability and fit in the submission form immediately before submission.

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
- GraphQL Admin API only for the catalog scan
- no customer scopes
- no order scopes
- no product write scopes

## Merchant-facing resource URLs

Privacy policy:
https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html

Support:
https://practical-automation-lab.onrender.com/shopify-feed-health-support.html

Developer website:
https://practical-automation-lab.onrender.com/

## Review instructions

1. Install the released app version on the review store.
2. Open the app from Shopify Admin.
3. The embedded dashboard authenticates through Shopify and runs a read-only catalog scan.
4. Review the readiness score, critical findings, warnings, and remediation notes.
5. Use **Rescan catalog** to verify repeat scanning.
6. Open **Support** to review scan boundaries and data-handling links.
7. The app does not require external account credentials, Merchant Center credentials, or payment information to test the current free functionality.

Expected behavior on an empty or clean test catalog: the app can return no findings. This is valid and should not be treated as an error.

## Demo screencast checklist

The review screencast should show, in order:

1. opening the app from Shopify Admin
2. embedded dashboard loading successfully
3. the scan result summary
4. one or more finding/remediation rows if the test catalog contains them
5. clicking **Rescan catalog**
6. opening **Support**
7. showing that the app never edits a product

Do not include passwords, access tokens, Shopify signed query parameters, private API credentials, or unrelated projects in the recording.

## Listing image checklist

- 1200×1200 app icon
- no text inside the icon
- no Shopify trademark inside the icon
- screenshots must show actual app UI, not browser chrome or desktop background
- each screenshot should show a different useful state or feature
- avoid statistics, guarantees, testimonials, ratings, or unsupported performance claims in images

## Privacy-compliance checklist

The source configuration declares:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

All three use `/webhooks/compliance` and are authenticated with Shopify's webhook authentication path. `shop/redact` deletes persisted Shopify sessions for the affected shop.

Important: committing `shopify.app.toml` is not enough. The configuration must be included in a released/deployed Shopify app version before App Store automated checks can see the subscriptions.

## Remaining account-level submission actions

These require the Shopify Dev Dashboard and should be done only after the code and public resource pages are live:

1. Create/release a new app version containing the mandatory compliance webhook subscriptions.
2. Change the public/admin app name to the final unique name if `PAL Catalog Check` remains available.
3. Confirm the app distribution path intended for a public multi-merchant app.
4. Add a valid support email in the App Store listing contact fields.
5. Upload the app icon and required screenshots.
6. Upload the demo screencast.
7. Run Shopify's automated pre-submission checks.
8. Do not authorize any registration fee or paid service without explicit owner approval.

## Commercial boundary

Initial public launch is free. Paid-plan validation can continue outside the review surface. Shopify App Pricing or Billing should be added only when a paid capability is actually implemented and the owner authorizes the monetization/publication step.
