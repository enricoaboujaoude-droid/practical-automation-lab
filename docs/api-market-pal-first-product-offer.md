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

## Authoritative initial commercial proposal — October 9, 2026
The latest proposal emailed to API.market supersedes earlier $1/request, $10 prepaid, and $49/month variants.

- Plan name: **Starter**.
- Price: **USD $19/month**.
- Included usage: **100 successfully processed billable API requests/month**.
- Billable unit: one successful audit request returning a usable **2xx** response, not one product row. Do not count invalid requests, upstream errors, or timeouts.
- Requested gateway rate limit: **30 requests/minute per buyer**. This is a requested limit, **not** an assertion that the origin currently enforces it.
- **No paid overages** initially; requests beyond the included allowance must be blocked or otherwise handled without an additional charge.
- `GET /api/health` and `GET /api/openapi` are **unbilled**.
- Pricing, quotas, rate limits, and gateway enforcement must be confirmed in the marketplace before publication.

## Activation checklist
1. Import the OpenAPI source into the existing PAL COMMERCE seller account.
2. Confirm `auditCatalog` works on the dedicated marketplace-billed origin with no second payment step.
3. Configure Starter billing and gateway limits, then publish the first product.
4. Return the public product URL and a confirmed external customer order before recognizing genuine revenue.
