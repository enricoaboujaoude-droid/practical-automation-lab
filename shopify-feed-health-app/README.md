# PAL Shopify Feed Health & Merchant Center Compliance

High-ceiling Shopify-native successor to the standalone Product Feed Preflight Auditor.

## Current stage

Account-independent implementation is complete and CI-verified. No Shopify App Store fee or production billing is authorized yet. The next stage is linking this code to a Shopify Dev Dashboard app and installing it on a development store for real-catalog validation.

## Verified account-independent gate

The Shopify build has passed all of the following on GitHub Actions using Node 22.22.0:

- production dependency audit at high severity,
- catalog-health unit tests,
- React Router / TypeScript typecheck,
- production build.

A temporary npm override pins `deepmerge-ts` to the patched 8.x line because the current Prisma dependency chain otherwise resolves to a vulnerable 7.x release. Remove the override once Prisma's dependency chain incorporates the patched major version directly.

## Architecture

- Current official Shopify React Router application pattern.
- Shopify-managed authentication through `@shopify/shopify-app-react-router`.
- GraphQL Admin API only for new public-app work.
- Minimum initial scope: `read_products`.
- Catalog scan uses paginated `products` queries, checks products/variants/images, and deliberately warns when per-product variant pagination is truncated.
- Generic catalog-health logic is isolated in `app/lib/catalog-health.mjs` and has Node-native tests.
- Merchant-facing dashboard supports an initial scan and manual rescan.
- Plan page prepares Free / Pro / Agency architecture without creating charges.
- Privacy-safe app analytics are emitted as aggregate `PAL_SHOPIFY_EVENT` application-log lines with no product identifiers or merchant catalog contents.

## Local/dev-store validation gate

1. Link the folder to a Shopify Dev Dashboard app with Shopify CLI.
2. Install on a development store.
3. Confirm `read_products` approval and authentication.
4. Verify catalog sync and scan output against a real dev-store catalog.
5. Verify repeat scan and aggregate event logs.
6. Only then decide whether publication/App Store registration is justified.

## Commands

```bash
npm install
npm audit --omit=dev --audit-level=high
npm test
npm run typecheck
npm run build
shopify app config link
shopify app dev
```

Never commit Shopify API secrets, access tokens, recovery codes, or merchant catalog data.
