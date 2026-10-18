# Pursekeeper seller listing / prepaid-credit request

This public request cross-references pursekeeper/api#22.

Practical Automation Lab has four live Nano/x402 v2 paid operations in one public service. They are owned by the same operator, use the same treasury and shared hardened payment rail, and perform distinct deterministic work.

- Operator: @enricoaboujaoude-droid
- Source: https://github.com/enricoaboujaoude-droid/practical-automation-lab
- x402 discovery: https://pal-catalog-check-app.onrender.com/.well-known/x402
- Treasury / payTo: `nano_1gcpoxg6o1heqtmub9srjbpdwoe9bm1n85tks3yznjhb9iywktixczc7ydpr`

## Live paid endpoints

1. PAL Nano Catalog Audit  
   https://pal-catalog-check-app.onrender.com/api/nano/catalog-audit
2. PAL GTIN Check  
   https://pal-catalog-check-app.onrender.com/api/nano/gtin-check
3. PAL Feed Diff  
   https://pal-catalog-check-app.onrender.com/api/nano/feed-diff
4. PAL x402/Nano Declaration Validator  
   https://pal-catalog-check-app.onrender.com/api/nano/x402-validate

## Public payment implementation

- `shopify-feed-health-app/nano-x402.mjs`
- `shopify-feed-health-app/nano-catalog-audit.mjs`
- `shopify-feed-health-app/nano-commerce-tools.mjs`

All four advertise x402 v2 `exact` on `nano:mainnet`.

Please run the normal real-paid-call/listing checks. Pursekeeper's public log describes the seller offer as prepaid credit per qualifying Nano-advertising endpoint. Please apply only the number of credits the current /sellers policy genuinely permits for this same-operator suite; if the policy treats the suite as one seller/credit, use that interpretation. No duplicate identity or exception is requested.
