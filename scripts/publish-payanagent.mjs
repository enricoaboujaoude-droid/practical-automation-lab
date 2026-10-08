import fs from "node:fs";

const BASE = "https://payanagent.com";
const WALLET = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF";
const PROVIDER_ENDPOINT = "https://pal-marketplace-fast-api.onrender.com";

async function request(path, options = {}) {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
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

const agent = await request("/api/v1/agents", {
  method: "POST",
  body: JSON.stringify({
    name: "Practical Automation Lab",
    description:
      "Automated ecommerce catalog intelligence for AI-shopping readiness, product-feed quality, GTIN validation and catalog remediation.",
    walletAddress: WALLET,
    chain: "base",
    tags: ["ecommerce", "shopify", "catalog", "merchant-center", "aieo", "product-data"],
    providerType: "api",
    agentUrl: PROVIDER_ENDPOINT,
  }),
});

if (!agent.apiKey || !agent.agentId) {
  throw new Error("PayanAgent registration did not return apiKey and agentId");
}

const commonHeaders = { Authorization: `Bearer ${agent.apiKey}` };

const offers = [
  {
    title: "PAL Ecommerce Catalog Audit",
    description:
      "Audit 1-100 ecommerce product records for AI-shopping readiness, duplicate identifiers, missing product attributes and Merchant Center compatibility.",
    category: "Ecommerce",
    tags: ["catalog-audit", "shopify", "merchant-center", "aieo", "product-data"],
    priceCents: 500,
    offerType: "api",
    endpoint: PROVIDER_ENDPOINT + "/api/catalog-audit",
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      records: [{ id: "sku-1", title: "Product name", price: "19.99", gtin: "optional" }],
    }),
    outputSchema: JSON.stringify({
      score: 0,
      issues: [],
      summary: "audit summary",
    }),
  },
  {
    title: "PAL Catalog Remediation Plan",
    description:
      "Generate prioritized remediation for 1-100 ecommerce products, including Merchant Center and AI-shopping readiness fixes.",
    category: "Ecommerce",
    tags: ["catalog-remediation", "shopify", "merchant-center", "product-feed", "aieo"],
    priceCents: 1500,
    offerType: "api",
    endpoint: PROVIDER_ENDPOINT + "/api/catalog-remediation",
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      records: [{ id: "sku-1", title: "Product name", price: "19.99", gtin: "optional" }],
    }),
    outputSchema: JSON.stringify({
      priorities: [],
      remediations: [],
      summary: "remediation summary",
    }),
  },
  {
    title: "PAL GTIN / UPC / EAN Validator",
    description:
      "Validate up to 100 GTIN, UPC or EAN identifiers with format and checksum results for ecommerce feeds.",
    category: "Ecommerce",
    tags: ["gtin", "upc", "ean", "validation", "product-feed"],
    priceCents: 300,
    offerType: "api",
    endpoint: PROVIDER_ENDPOINT + "/api/gtin-check",
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      gtins: ["00850012345678"],
    }),
    outputSchema: JSON.stringify({
      ok: true,
      count: 1,
      results: [{ gtin: "00850012345678", valid: true }],
    }),
  },
  {
    title: "PAL Product Feed Diff",
    description:
      "Compare two product-feed snapshots of up to 100 records each and return added, removed and changed products and fields.",
    category: "Ecommerce",
    tags: ["feed-diff", "catalog", "change-detection", "shopify", "merchant-center"],
    priceCents: 800,
    offerType: "api",
    endpoint: PROVIDER_ENDPOINT + "/api/feed-diff",
    httpMethod: "POST",
    inputSchema: JSON.stringify({
      before: [{ id: "sku-1", price: "19.99" }],
      after: [{ id: "sku-1", price: "21.99" }],
    }),
    outputSchema: JSON.stringify({
      added_count: 0,
      removed_count: 0,
      changed_count: 1,
      changed: [],
    }),
  },
];

const published = [];
for (const offer of offers) {
  const result = await request("/api/v1/offers", {
    method: "POST",
    headers: commonHeaders,
    body: JSON.stringify(offer),
  });
  published.push({
    title: offer.title,
    price_usd: offer.priceCents / 100,
    endpoint: offer.endpoint,
    offer_id: result.offerId || result.id || null,
    buy_url: result.buyUrl || null,
  });
}

const metadata = {
  marketplace: "PayanAgent",
  provider: "Practical Automation Lab",
  provider_agent_id: agent.agentId,
  payout_wallet: WALLET,
  registered_at: new Date().toISOString(),
  offers: published,
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/payanagent-listing.json", JSON.stringify(metadata, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      registered: true,
      agent_id: agent.agentId,
      offer_count: published.length,
      offers: published,
    },
    null,
    2,
  ),
);
