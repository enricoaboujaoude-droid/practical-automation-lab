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

## Distribution decision — do not lock this accidentally

The intended production path is **Public distribution through the Shopify App Store**, because the product is designed for unrelated merchants and may later use Shopify App Pricing.

Important control:
- Shopify says the app's distribution method cannot be changed after selection.
- **Public distribution** supports installation by multiple unrelated merchants and requires App Store approval.
- **Custom distribution** is for a single store or stores in the same Plus organization and cannot use Shopify's app billing system.
- App Store listing visibility is a separate setting: a public app can later use limited or full visibility, and visibility can be changed after publication.

Do not select Custom distribution as a shortcut for beta if the long-term intent remains a public multi-merchant app.

## Current App Store registration fee — explicit spend gate

As of September 17, 2026, Shopify documents a **one-time $19 USD App Store registration fee per Partner account**. Registration requires a payment method.

Project rule:
- this fee is **not authorized yet**
- do not add a payment method or register/pay without explicit owner approval
- the fee should only be considered after the submission package is otherwise ready or a commercial signal justifies changing the $0-before-revenue rule

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

For a future paid release, Shopify App Pricing is the default/recommended billing path for new public apps and can be configured in the Partner Dashboard. Development-store billing tests can be performed without real charges.

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

Product / beta page:
https://practical-automation-lab.onrender.com/shopify-catalog-check.html

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

Shopify currently requires a demo screencast for App Store review. The review screencast should show, in order:

1. opening the app from Shopify Admin
2. embedded dashboard loading successfully
3. the scan result summary
4. one or more finding/remediation rows if the test catalog contains them
5. clicking **Rescan catalog**
6. opening **Support**
7. showing that the app never edits a product

Do not include passwords, access tokens, Shopify signed query parameters, private API credentials, or unrelated projects in the recording.

## Listing image checklist

Prepared icon asset:
`shopify-feed-health-app/listing-assets/pal-catalog-check-icon-1200.png`

Current Shopify guidance:
- app icon: exactly 1200×1200 PNG or JPEG
- no text inside the icon
- no Shopify trademark inside the icon
- desktop screenshots: 1600×900 (16:9) is the current recommended format
- include 3–6 useful desktop screenshots when preparing the listing
- screenshots must primarily show the actual app UI, not desktop backgrounds or browser chrome
- each screenshot should show a different useful feature, view, or state
- avoid pricing, statistics, guarantees, testimonials, ratings, or unsupported performance claims in images

Actual app screenshots and the review screencast must be captured from the real embedded Shopify app. Do not fabricate them with generated/mock UI.

## Privacy-compliance checklist

The source configuration declares:

- `customers/data_request`
- `customers/redact`
- `shop/redact`

All three use `/webhooks/compliance` and are authenticated with Shopify's webhook authentication path. `shop/redact` deletes persisted Shopify sessions for the affected shop.

Important: committing `shopify.app.toml` is not enough. The configuration must be included in a released/deployed Shopify app version before App Store automated checks can see the subscriptions.

## Contact and account prerequisites

Before submission, confirm all required Partner/App Store contact fields are valid:
- API contact email
- merchant support email
- emergency developer contact in the Partner account

Do not expose credentials or private project data in any public contact field, screencast, listing asset, or review note.

## Remaining account-level submission actions

These require the Shopify Dev/Partner Dashboard and should be done only after the code and public resource pages are live:

1. Create/release a new app version containing the mandatory compliance webhook subscriptions.
2. Change the public/admin app name to the final unique name if `PAL Catalog Check` remains available.
3. Select **Public distribution** only when ready to intentionally lock the irreversible distribution choice.
4. Add/confirm the API contact email, support email, and emergency developer contact.
5. Upload the prepared 1200×1200 app icon.
6. Capture and upload real app screenshots.
7. Record and upload the real demo screencast.
8. Complete Shopify's automated pre-submission checks.
9. Register for the Shopify App Store and pay the current one-time $19 USD fee **only after explicit owner approval**.
10. Submit for review only after every automated requirement is green.

## Commercial boundary

Initial public launch is free. Paid-plan validation can continue outside the review surface. Shopify App Pricing should be added only when a paid capability is actually implemented and the owner authorizes the monetization/publication step.
