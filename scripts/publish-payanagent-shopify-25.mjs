import fs from "node:fs";

const BASE = "https://payanagent.com";
const WALLET = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF";
const PROVIDER_ENDPOINT = "https://pal-marketplace-fast-api.onrender.com";
const OFFER_ENDPOINT = PROVIDER_ENDPOINT + "/api/shopify-store-audit";

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

const existing = await request("/api/v1/offers?q=PAL%20Live%20Shopify%20Store%20Commerce%20Audit&limit=50");
const match = Array.isArray(existing?.offers)
  ? existing.offers.find((offer) =>
      String(offer?.title || "") === "PAL Live Shopify Store Commerce Audit" &&
      Number(offer?.priceUsd) === 25
    )
  : null;

if (match?._id) {
  const metadata = {
    marketplace: "PayanAgent",
    provider: "Practical Automation Lab",
    payout_wallet: WALLET,
    already_live: true,
    checked_at: new Date().toISOString(),
    offer: {
      offer_id: match._id,
      title: match.title,
      price_usd: match.priceUsd,
      buy_url: match.buyUrl || `/x402/${match._id}`,
      seller_id: match.sellerId || null,
    },
  };
  fs.mkdirSync("revenue", { recursive: true });
  fs.writeFileSync("revenue/payanagent-shopify-25.json", JSON.stringify(metadata, null, 2) + "\n");
  console.log(JSON.stringify(metadata, null, 2));
  process.exit(0);
}

const agent = await request("/api/v1/agents", {
  method: "POST",
  body: JSON.stringify({
    name: "Practical Automation Lab — Live Shopify Audit",
    description:
      "Automated public-storefront Shopify audit for AI-shopping/AIEO readiness, product identifiers, catalog quality and Merchant Center compatibility.",
    walletAddress: WALLET,
    chain: "base",
    tags: ["shopify", "ecommerce", "aieo", "ai-shopping", "merchant-center", "catalog-audit"],
    providerType: "api",
    agentUrl: PROVIDER_ENDPOINT,
    ownerEmail: "enricoaboujaoude@gmail.com",
  }),
});

if (!agent.apiKey || !agent.agentId) {
  throw new Error("PayanAgent registration did not return apiKey and agentId");
}

const result = await request("/api/v1/offers", {
  method: "POST",
  headers: { Authorization: `Bearer ${agent.apiKey}` },
  body: JSON.stringify({
    title: "PAL Live Shopify Store Commerce Audit",
    description:
      "Deep public Shopify storefront audit across up to 250 products/variants. Returns AI-shopping/AIEO readiness coverage, product identifier gaps, structural catalog issues and prioritized Merchant Center remediation. No store login required.",
    category: "Ecommerce",
    tags: ["shopify", "aieo", "ai-shopping", "merchant-center", "full-store", "catalog-remediation"],
    priceCents: 2500,
    offerType: "api",
    endpoint: OFFER_ENDPOINT,
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      url: "https://example-shop.com",
    }),
    outputSchema: JSON.stringify({
      service: "PAL Live Shopify Store Commerce Audit",
      aieo_score: 0,
      coverage: {},
      structural_audit: {},
      recommendations: [],
      sample: { products: 0, variants: 0, product_limit: 250, variant_limit: 250 },
    }),
  }),
});

const metadata = {
  marketplace: "PayanAgent",
  provider: "Practical Automation Lab",
  provider_agent_id: agent.agentId,
  payout_wallet: WALLET,
  registered_at: new Date().toISOString(),
  offer: {
    offer_id: result.offerId || result.id || null,
    title: "PAL Live Shopify Store Commerce Audit",
    price_usd: 25,
    endpoint: OFFER_ENDPOINT,
    buy_url: result.buyUrl || null,
  },
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/payanagent-shopify-25.json", JSON.stringify(metadata, null, 2) + "\n");
console.log(JSON.stringify(metadata, null, 2));
