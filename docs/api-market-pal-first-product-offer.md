# PAL COMMERCE — First API.market Product Offer

Status: **proposed commercial terms; not published or payment-verified**.

Seller: PAL COMMERCE (existing account; do not create duplicate organization).

## Product
PAL Commerce Catalog AIEO Audit. Automated catalog QA for AI-shopping/agentic-commerce readability: product identity, attributes, identifiers, images, variants, price, availability, and product links. AIEO complements SEO; no promise of AI ranking or inclusion.

## Marketplace import
- Public OpenAPI document: https://pal-marketplace-fast-api.onrender.com/api/openapi
- Marketplace-billed production origin: https://pal-marketplace-fast-api.onrender.com
- First operation: `POST /api/catalog-audit` (`auditCatalog`).
- One request accepts **1–100 product records** according to the public OpenAPI contract.
- Do not send buyer traffic until the marketplace has verified import, authentication, gateway billing, and absence of any second origin-side x402 charge.

## Initial commercial proposal
- Price: **USD $1 per successfully processed catalog-audit API request**, not per product row.
- If prepaid-plan-only: **USD $10 for 10 successful requests**, without automatic paid overages.
- Billable unit: one successful audit request with usable result. Do not bill invalid requests, upstream errors, or timeouts.
- Requested gateway rate limit: **20 requests/hour and 200 requests/day per buyer**. These are *requested limits*, not an assertion that origin currently enforces them. Confirm enforcement before launch.
- Do not publish until the marketplace confirms billing semantics and gateway limits.

## Activation checklist
1. Import the OpenAPI source into the existing PAL COMMERCE seller account.
2. Confirm `auditCatalog` works on the dedicated marketplace-billed origin with no second payment step.
3. Configure gateway billing and limits, then publish the first product.
4. Return the public product URL and a confirmed external customer order before recognizing genuine revenue.
