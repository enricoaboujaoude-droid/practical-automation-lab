# PAL Native Neon Marketplace API — 2026-10-16

The PAL Marketplace API is now natively deployed on the existing Neon production function `palmarket` (deployment 4) at https://br-wild-truth-b2gxc5zl-palmarket.compute.c-6.eu-central-1.aws.neon.tech/api/health. Staging was tested on function `palmarketnative` in project shy-dew-64351134. Original implementation is derived from marketplace-fast-api/server.js and marketplace-fast-api/lib/catalog.js.

Verified: GET /api/health returns 200; synthetic POST /api/agentpay gives a valid audit; paid API.market POST routes without the existing billing key reject with 401. Encrypted PAL_API_MARKET_SHARED_SECRET was preserved in the environment without disclosure. The public /api/agentpay route relies on upstream marketplace billing and is not a direct paid x402 endpoint.

API.market product import, pricing, and publishing are still required in the seller console. No paid transaction has been verified. Existing Neon production database must not be overwritten with the older Render recovery snapshot. No Render subscription upgrade or ad spend is authorized.
