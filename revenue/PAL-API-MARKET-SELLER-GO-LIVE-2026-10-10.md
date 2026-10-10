# API.market first paid product — owner-only final seller-console gate
Date: 2026-10-10. Scope: Practical Automation Lab; do not alter Kalikora.

## Verified application and commercial readiness

- Production Neon catalog API: https://br-wild-truth-b2gxc5zl-palmarket.compute.c-6.eu-central-1.aws.neon.tech
- Existing Render fallback: https://pal-marketplace-fast-api.onrender.com
- OpenAPI source to import: https://br-wild-truth-b2gxc5zl-palmarket.compute.c-6.eu-central-1.aws.neon.tech/api/openapi
- Four-operation static schema with complete request bodies: https://raw.githubusercontent.com/enricoaboujaoude-droid/practical-automation-lab/main/api-market-pal-openapi.json
- API.market seller team (Tanzeela, October 10) confirmed Neon GTIN and catalog audit operations working and specified exact seller-console blockers. We fixed origin authentication and request bodies.
- Backend paid operations: POST /api/catalog-audit, /api/catalog-remediation, /api/gtin-check, /api/feed-diff. Only these four must be selected for the first marketplace product.
- A **private, random 64-character origin key** is configured in Neon function `palmarket` and the legacy Render compatibility service `pal-marketplace-fast-api`. Never include it in email, chat, GitHub or public docs. Both origins should return HTTP 401 for unauthenticated paid POSTs.
- Source of truth for owner-only credential access: Neon production database `pal_shopify_sessions`, SQL Editor, query `SELECT secret FROM public.pal_api_market_origin_credentials WHERE name='api_market_origin';`. Only copy it into the seller-console API Source Authentication wizard.
- No changes to the Shopify free public quick-audit route. Health and OpenAPI GETs are public, with x-magicapi-billing: API=0.
- Isolated Neon QA deployment `palmarketqa` validated authorization 401/200, body schema and public 3D&Dice storefront sampling. The preview key is intentionally a non-production test string. GitHub run `38066581247` passed.
- Production Neon function `palmarket` deployment 3 completed and health returned `version: 1.2.1`. GitHub no-bypass workflow `pal-api-market-production-readiness.yml` completed successfully in run `38066842861` on BOTH Neon and Render.
- Origin authentication and source OpenAPI CI contract also passed run `38066283262`.
- The seller team was replied to on October 10 in the existing email thread with readiness confirmation and request for assisted setup if they support it. Never create another PAL COMMERCE seller organization.

## Final seller-console action (requires owner's authenticated API.market session)

1. Open https://api.market/seller and sign in to the existing PAL COMMERCE account.
2. Select the existing PAL COMMERCE organization, not a new organization.
3. Under **Manage APIs → OpenAPI Specs → Import API Source**, use the Neon /api/openapi URL above or upload the four-operation static JSON schema.
4. In the Authentication step select **API Key**, header name `x-pal-origin-key`. Retrieve the **value** privately via the Neon SQL Editor query above. The header value must never go into the public spec or billing plan description.
5. Check that the base URL is the Neon production `palmarket` host and only the four POST operations appear in the first product. Use API Playground to verify a GTIN request with the gateway key succeeds, and unauthenticated direct origin calls still return 401.
6. Create product `PAL Commerce Catalog Intelligence`. Summary: automated Shopify/product-feed catalog audit, actionable remediation, GTIN validation and before/after feed change detection. No Search ranking guarantee. Attach the existing API Source and four operations.
7. Create a public Free plan at $0 with a strict trial allowance as the seller team instructed, then public Starter plan at **$19/month, 100 successful 2xx billable requests**, a hard request limit, 1 req/second, and no overage. Do not bill /api/health or /api/openapi. Do not charge twice; upstream API.market gateway bills, PAL origin only authenticates.
8. Test in the buyer API Playground; submit for review. Record published product URL, subscription confirmation, and payout eligibility. Never infer income from a successful test alone.
9. Optional **Growth** tier after first review: $49/month for 1,000 calls with appropriate rate/record limits; one real Growth sale could exceed the user's $20 gross revenue milestone. This is a proposal, not an activated plan or booked revenue.

## Verification and revenue accounting

- Run `.github/workflows/pal-api-market-production-readiness.yml` whenever routes change; it checks both Neon and Render refuse unpaid direct calls. It runs every six hours.
- Github source `marketplace-fast-api/server.js`, native Neon module `neon-runtime/palmarket-native.mjs`, `neon-runtime/lib/catalog.js` and static spec `api-market-pal-openapi.json`.
- If a buyer reports failure: check Neon `palmarket` health, the source auth header configuration, body schema, and API.market billing gateway response. Do not turn off auth to “fix” a 401.
- Net receipt may be less than listed price due to API.market's marketplace fee. A $19 gross Starter sale is below a $20 gross/realized single-payment target; two Starter buyers, an annual Shopify Pro subscriber, or one legitimately purchased higher plan would meet it.
- No independently verified $20+ customer payment had occurred by this checkpoint. Keep the existing Render/Neon transfer and payouts intact.
