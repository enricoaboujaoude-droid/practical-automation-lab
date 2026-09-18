# PAL Catalog Check — Shopify App Store submission form package

Prepared for the canonical Partner-owned public app.

## Canonical production identity

- Partner organization: Practical Automation Lab
- App name: PAL Catalog Check
- Distribution: Public
- Released Shopify version baseline: `pal-catalog-check-5`
- Production app URL: https://pal-catalog-check-app.onrender.com
- OAuth redirect URL: https://pal-catalog-check-app.onrender.com/auth/callback
- Development store: PAL Feed Health Dev (`pal-feed-health-dev.myshopify.com`)
- Access scope: `read_products` only
- Planned launch pricing: Free + Pro after Pro production validation

## App card subtitle

Find catalog issues before they become product-feed problems

## App introduction

Find catalog issues early and get clear, read-only remediation guidance before feed setup.

Character count: 90 / 100.

## App details

PAL Catalog Check scans your Shopify product catalog for missing or risky fields that can cause product-feed problems. Review readiness score, critical issues, warnings, and practical remediation for titles, vendors, URLs, images, prices, identifiers, and variant options. The app is read-only: it never edits products or variants, requests only read_products, and does not require Merchant Center credentials.

Character count: 410 / 500.

## Feature list

1. Scan products and variants for common catalog-readiness issues
2. Flag missing images, risky prices, and duplicate variant options
3. Review vendor, URL, identifier, and image-dimension gaps
4. Get practical remediation guidance without editing your catalog
5. Rescan anytime to confirm whether catalog changes improved readiness

All feature lines are under Shopify's current 80-character guidance.

## Category

Preferred candidate: Product feeds.

Confirm the exact current category option in the submission form before saving. Do not force a mismatched category.

## Search terms

Use only if the current form accepts them:

- product feed
- catalog audit
- merchant center
- feed errors
- product data

Do not repeat these unnaturally in the subtitle or details.

## Integrations

Do not claim a direct Google Merchant Center integration.

PAL Catalog Check provides catalog-readiness guidance only and does not connect to a merchant's Merchant Center account.

## Pricing

Planned public launch ladder after the Pro branch passes production validation:

### Free — $0

- manual catalog-readiness scan
- readiness score, critical issues, and warnings
- product / variant / image checks
- practical remediation guidance
- manual rescan
- current bounded Free limits: 2,500 products, 100 variants per product, 20 images per product

### Pro — target $19.99 / month or $199 / year

- automatic recurring catalog scans
- saved scan history
- change detection between saved scans
- health-drop and critical-issue alerts inside the app
- January 31, 2027 image-readiness monitoring
- current bounded Pro limits: 10,000 products, 250 variants per product, 100 images per product
- downloadable scan-history and findings CSV reports
- scheduled report snapshots

The $19.99 / $199 launch target is a competitive starting point, not a hard-coded application constant. Shopify App Pricing owns the actual public plan price. Confirm the final value in the Partner Dashboard only after the Pro build is deployed and tested on the development store.

Do not advertise Agency/Commercial, multi-store, white-label, direct Merchant Center integration, catalog editing, email alerts, or other capabilities that are not implemented.

## Merchant-facing URLs

Product page:
https://practical-automation-lab.onrender.com/shopify-catalog-check.html

Privacy policy:
https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html

Support:
https://practical-automation-lab.onrender.com/shopify-feed-health-support.html

Developer website:
https://practical-automation-lab.onrender.com/

## App icon

Repository asset:
`shopify-feed-health-app/listing-assets/pal-catalog-check-icon-1200.png`

Verified dimensions:
1200 × 1200 PNG.

Do not replace with generated review evidence. Preserve the current text-free PAL Catalog Check icon unless a real issue is found in Shopify's preview.

## Required real screenshots

Capture 3 desktop screenshots at 1600 × 900, without browser chrome, desktop background, PII, credentials, pricing claims, reviews, or outcome guarantees.

### Screenshot 1 — Readiness overview

Show:
- PAL Catalog Check heading
- readiness score
- critical issue count
- warning count
- products / variants / images summary

Recommended alt text:
PAL Catalog Check catalog-readiness summary with score and issue counts.

### Screenshot 2 — Findings and remediation

Scroll to a clearly different section/state showing:
- real critical or warning findings
- practical remediation guidance
- enough context to show that the findings come from the actual product

Recommended alt text:
PAL Catalog Check findings with read-only catalog remediation guidance.

### Screenshot 3 — Support and scan boundaries

Open Support and show:
- read-only positioning
- scan limits/boundaries
- support or data-handling information

Recommended alt text:
PAL Catalog Check support page with scan boundaries and read-only guidance.

Do not use three near-identical captures of the same summary screen.

## Review screencast script

Record a real English-language screencast of the actual app.

Recommended flow:

1. Start in Shopify Admin on the review/development store.
2. Open PAL Catalog Check.
3. Show the embedded app loading successfully.
4. Show the readiness score and catalog counts.
5. Show at least one real finding and its remediation.
6. Click Rescan catalog.
7. Wait for the real rescan to complete.
8. Open Support.
9. Show the scan boundaries and data-handling/read-only information.
10. State or visibly demonstrate that the app does not edit products or variants.
11. End without exposing any secret, token, signed Shopify query parameter, unrelated project, or private account information.

## Reviewer testing instructions

1. Install PAL Catalog Check on the Shopify review store.
2. Open the app from Shopify Admin.
3. The app authenticates through Shopify and automatically runs a read-only catalog scan.
4. Review the readiness score, critical findings, warnings, and remediation guidance.
5. Click Rescan catalog to verify repeat scanning.
6. Open Support to review scan boundaries and data-handling information.
7. Free functionality does not require external account credentials, Merchant Center credentials, or payment information.
8. If Pro is enabled for review, use Shopify's own App Pricing test flow on the development/review store; do not provide external payment credentials.
9. An empty or clean catalog can legitimately return no findings.

## Current verified production evidence

- clean production URL is live
- released version: `pal-catalog-check-5`
- embedded app authentication: PASS
- durable Neon offline session: PASS
- scope: `read_products` only
- real scan: 17 products / score 62
- two controlled rescans: PASS
- post-legacy-app-removal open: PASS
- `GET /app`: HTTP 200
- current CI: audit, DB check, tests, typecheck, build — PASS

Development-store results are test evidence only and must not be represented as external market demand.

## Dashboard-only items that still require confirmation

- Emergency developer contact is complete and current at the Partner account level.
- API contact email is complete and current.
- App icon is uploaded/confirmed in Shopify.
- Listing fields are saved using the factual copy above.
- Three genuine desktop screenshots are uploaded.
- Genuine review screencast is uploaded.
- Pro production feature validation is complete before any Pro capability is advertised.
- Shopify App Pricing is configured with Free + Pro only after Pro validation; plan handles and welcome link are checked.
- Partner API client with Manage apps permission is configured so paid entitlement can be verified server-side.
- Shopify automated pre-submission checks all pass.
- Any requested review/test credentials field states that no external credentials are required.
- One-time App Store registration fee is paid only if it becomes the final meaningful blocker and remains within the owner's authorized maximum of $19 USD.
- Submit for review only after every preceding check is green.

Issue #5 remains open until genuine public/external launch.
