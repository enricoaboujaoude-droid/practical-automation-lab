# PAL Catalog Check

PAL Catalog Check is a read-only Shopify catalog-readiness application.

## What it checks

The app reviews Shopify product and variant data for catalog-readiness issues including:

- product titles and vendors
- product URLs
- images and observable image dimensions
- prices
- product and variant identifiers
- duplicate variant option combinations

It provides a readiness summary and remediation guidance without editing merchant catalog data.

## Shopify access

The app requests only:

- `read_products`

It does not request customer data, order data, or product write access.

## Technology

- Shopify embedded app
- Shopify GraphQL Admin API
- React Router
- TypeScript
- Prisma-backed Shopify session storage
- Node.js

## Development

```bash
npm install
npm test
npm run typecheck
npm run build
```

Never commit Shopify API secrets, access tokens, recovery codes, signed request parameters, or merchant catalog data.
