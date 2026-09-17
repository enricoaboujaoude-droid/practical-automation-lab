# PAL Catalog Check — Shopify App Store submission runbook

Status: pre-submission control document

Date checkpoint: 2026-09-17

## Objective

Move PAL Catalog Check from public-launch readiness to a complete Shopify App Store review submission without adding unvalidated product scope or unnecessary spend.

The current reviewable product is intentionally simple:
- free at initial public launch
- embedded Shopify app
- read-only catalog analysis
- `read_products` only
- no customer or order scopes
- no product write scopes
- no external Merchant Center login
- no paid functionality advertised inside the reviewable app

## Gates already passed

Do not repeat these unless evidence shows a regression:

- development-store install and authentication
- real catalog scan
- repeat scan
- durable Shopify session storage in dedicated Postgres
- session survival across Render redeploy
- signed Shopify request-parameter redaction from application access logs
- mandatory privacy-compliance webhook code
- review-surface cleanup to implemented functionality only
- merchant-facing Support surface
- public Privacy and Support URLs
- 1200×1200 text-free app icon prepared
- public PAL Catalog Check acquisition page live

## Owner publication-fee authorization

The owner authorized the current one-time Shopify App Store registration fee of up to **$19 USD** on 2026-09-17 under one condition:

> Pay/register only when all autonomous and no-cost preparation is complete and the fee is the final meaningful blocker to Public distribution.

This does not authorize ads, paid APIs, paid datasets, paid hosting upgrades, domains, subscriptions, or any other pre-revenue spend.

The fee is a commercial break-even target, not a guaranteed return. Under Shopify's current published revenue-share model, the first $1,000,000 USD of gross app revenue is retained by the developer, subject to a 2.9% processing fee and applicable taxes. The project should therefore target the first real paid customer to recover the publication cost as quickly as practical once paid functionality is actually introduced.

## Required account-level sequence

Do these in order. Do not intentionally lock distribution before the preceding checks are ready.

1. Release a new Shopify app version that contains the mandatory compliance webhook subscriptions.
2. Confirm the final public/admin app name. Working name: **PAL Catalog Check**.
3. Confirm the API contact email, merchant support email, and emergency developer contact.
4. Confirm the app URL, redirect/auth behavior, `read_products` scope, and embedded-app configuration.
5. Upload the prepared 1200×1200 app icon.
6. Capture real screenshots from the installed embedded app.
7. Record the real review screencast from Shopify Admin.
8. Complete Shopify's automated pre-submission checks.
9. Intentionally choose **Public distribution** only when ready to lock that distribution method.
10. If the $19 App Store registration fee is then the final blocker, register/pay under the owner's authorization.
11. Submit for review only when the submission form and automated checks are complete.

## Screenshot capture plan

Use only the real embedded PAL Catalog Check app. Do not fabricate or generate review screenshots.

Capture distinct screenshots showing:

1. Dashboard / readiness summary after a successful scan.
2. Critical issue or warning list with remediation guidance visible.
3. A different finding state or catalog-quality section.
4. Rescan control and scan-boundary explanation.
5. Embedded Support page with privacy/support links.

Rules:
- show actual app UI and features
- avoid browser chrome and desktop backgrounds when preparing final listing images
- do not include passwords, tokens, signed Shopify query parameters, API credentials, database details, or unrelated projects
- do not add testimonials, ratings, fake statistics, guarantees, or unsupported claims
- each screenshot must show a materially different state or feature

## Review screencast script

Record the real installed app in English or with English subtitles.

Sequence:

1. Start inside Shopify Admin on the development/review store.
2. Open PAL Catalog Check from Apps.
3. Show the embedded dashboard loading normally.
4. Show the readiness score and scan summary.
5. Open at least one real finding and its remediation guidance.
6. Explain that the app is read-only and does not edit products.
7. Click **Rescan catalog** and show successful completion.
8. Open **Support**.
9. Show the privacy/support links and scan-boundary explanation.
10. End without revealing credentials, tokens, signed request parameters, or private infrastructure.

## Reviewer test instructions

The reviewer should be able to:

1. Install/open the released app through Shopify.
2. Load the embedded app successfully.
3. Run the read-only catalog scan.
4. Review readiness score, critical findings, warnings, and remediation notes.
5. Run a repeat scan.
6. Open Support.

The current free product requires no external account credentials, Merchant Center credentials, or payment information.

An empty or clean test catalog can validly return no findings.

## Submission claims boundary

Allowed factual positioning:
- read-only Shopify catalog-readiness scanner
- finds catalog issues that can create product-feed problems
- provides remediation guidance
- checks product and variant data available through Shopify
- helps merchants prepare catalog data for shopping/product-feed workflows

Do not claim:
- direct Google Merchant Center integration
- guaranteed Merchant Center approval
- automatic product fixes
- scheduled monitoring if it is not yet implemented
- paid tiers or subscriptions that are not yet implemented
- customer/order analysis
- write access to products

## Public launch measurement

Keep development activity separate from genuine market evidence.

Primary external acquisition event:
- `shopify_beta_interest`
- count only `is_test=false`

After public App Store availability, separately track:
- public installs
- first successful scan
- repeat scans
- remediation engagement
- explicit paid-feature/plan interest once a real paid path exists
- first paid subscription
- retained subscription revenue

## Break-even discipline

The $19 registration cost should be tracked explicitly until recovered by genuine app revenue.

Do not describe the fee as recovered until net observable app revenue attributable to PAL Catalog Check exceeds the actual registration charge and relevant processing cost/tax effects are accounted for.

If public distribution produces no meaningful installs, usage, recurring-value evidence, or commercial intent after adequate exposure, the portfolio governor should reassess further investment rather than adding features blindly.

## Continuous-improvement rule

While review/submission progresses:
- keep improving reliability, onboarding clarity, remediation usefulness, privacy, security, and discovery
- do not add speculative paid-feature bloat before merchant evidence
- continue zero-cost distribution and SEO
- keep the standalone Product Feed Preflight Auditor as an acquisition/evidence probe
- continue parallel opportunity discovery across Shopify, Amazon seller software, merchant SaaS, APIs, monitoring, compliance, and other platform-native revenue opportunities
- promote another build only when it is materially stronger or complementary and does not derail the Shopify launch
