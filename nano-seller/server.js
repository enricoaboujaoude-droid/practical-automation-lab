import express from "express";
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";

const PORT = Number(process.env.PORT || 10000);
const PRICE_RAW = process.env.PRICE_RAW || "10000000000000000000000000000";
const PRICE_NANO = "0.01";
const VERIFY_BASE = process.env.NANO_VERIFY_BASE || "https://pursekeeper.dev/v1/verify";
const PAY_TO = String(process.env.NANO_ADDRESS || "").trim();
const BASE_PAYOUT_ADDRESS = String(process.env.PAL_BASE_PAYOUT_ADDRESS || "").trim();
const PAYANAGENT_BOOTSTRAP = process.env.PAYANAGENT_BOOTSTRAP === "1";
const PAYANAGENT_BASE = "https://payanagent.com";
const PUBLIC_BASE_URL = String(
  process.env.PUBLIC_BASE_URL || "https://pal-nano-catalog-audit.onrender.com"
).replace(/\/$/, "");
const PAYANAGENT_OFFER_TITLE = "PAL Catalog Feed Identifier Audit";
const PAYANAGENT_OFFER_ENDPOINT = `${PUBLIC_BASE_URL}/v1/payanagent/catalog-audit`;
const X402_NETWORK = "eip155:8453";
const X402_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const X402_PRICE_USD = "$0.01";
const X402_PRICE_ATOMIC = "10000";
const X402_FACILITATOR_URL = String(
  process.env.X402_FACILITATOR_URL || "https://facilitator.payai.network"
).replace(/\/$/, "");
const X402_AUDIT_PATH = "/v1/x402/catalog-audit";
const X402_AUDIT_URL = `${PUBLIC_BASE_URL}${X402_AUDIT_PATH}`;
const AGENT402_BOOTSTRAP = process.env.AGENT402_BOOTSTRAP === "1";
const AGENT402_REGISTER_URL = "https://agent402.tools/api/index/register";
const USDC_X402_ENDPOINT = `${PUBLIC_BASE_URL}/v1/usdc/catalog-audit`;
const USDC_X402_PRICE = "$0.01";
const USDC_X402_NETWORK = "eip155:8453";

if (!/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(PAY_TO)) {
  throw new Error("NANO_ADDRESS must be a valid public Nano address");
}
if (!/^0x[a-fA-F0-9]{40}$/.test(BASE_PAYOUT_ADDRESS)) {
  throw new Error("PAL_BASE_PAYOUT_ADDRESS must be a valid public EVM address");
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));

const x402Server = new x402ResourceServer(
  new HTTPFacilitatorClient({ url: X402_FACILITATOR_URL })
).register(X402_NETWORK, new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      [`POST ${X402_AUDIT_PATH}`]: {
        accepts: [
          {
            scheme: "exact",
            price: X402_PRICE_USD,
            network: X402_NETWORK,
            payTo: BASE_PAYOUT_ADDRESS,
          },
        ],
        description:
          "Deterministic product-feed identifier and consistency audit for up to 100 records.",
        mimeType: "application/json",
      },
    },
    x402Server,
  ),
);

const usdcFacilitatorClient = new HTTPFacilitatorClient(facilitator);
const usdcResourceServer = new x402ResourceServer(usdcFacilitatorClient)
  .register(USDC_X402_NETWORK, new ExactEvmScheme());

app.use(
  paymentMiddleware(
    {
      "POST /v1/usdc/catalog-audit": {
        accepts: [
          {
            scheme: "exact",
            price: USDC_X402_PRICE,
            network: USDC_X402_NETWORK,
            payTo: BASE_PAYOUT_ADDRESS,
          },
        ],
        description:
          "Deterministic product-feed identifier and consistency audit for 1-100 catalog records.",
        mimeType: "application/json",
        serviceName: "PAL Catalog Feed Identifier Audit",
        tags: ["catalog", "product-feed", "ecommerce", "validation", "merchant-center"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              bodyType: "json",
              bodyFields: {
                records: {
                  type: "array",
                  required: true,
                  description:
                    "1-100 product records with fields such as id, title, link, image_link, gtin, brand, mpn, price, availability, identifier_exists.",
                },
              },
            },
            output: {
              example: {
                ok: true,
                record_count: 1,
                issue_count: 0,
                error_count: 0,
                warning_count: 0,
                issues: [],
              },
            },
          }),
        },
      },
    },
    usdcResourceServer,
  ),
);

const usedPayments = new Map();
const inFlightPayments = new Set();
let paidAudits = 0;
let payanAgentState = {
  enabled: PAYANAGENT_BOOTSTRAP,
  status: PAYANAGENT_BOOTSTRAP ? "pending" : "disabled",
  agent_id: null,
  offer_id: null,
  checked_at: null,
  error: null,
};
let agent402State = {
  enabled: AGENT402_BOOTSTRAP,
  status: AGENT402_BOOTSTRAP ? "pending" : "disabled",
  listed: false,
  checked_at: null,
  seller: null,
  error: null,
};

function nowIso() {
  return new Date().toISOString();
}

function paymentRequired(res, reason = "payment_required", detail = null) {
  return res.status(402).json({
    error: reason,
    detail,
    asset: "XNO",
    network: "nano:mainnet",
    scheme: "pal-nano-hash-v1",
    pay_to: PAY_TO,
    price_raw: PRICE_RAW,
    price_nano: PRICE_NANO,
    retry_header: "X-Nano-Payment",
    verification: "https://pursekeeper.dev/v1/verify",
  });
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractAgentPayRecords(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index]?.content;
    if (content && typeof content === "object" && !Array.isArray(content)) {
      if (Array.isArray(content.records)) return content.records;
      continue;
    }
    if (typeof content !== "string") continue;

    let text = content.trim();
    if (!text) continue;

    const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) text = fenced[1].trim();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.records)) {
        return parsed.records;
      }
    } catch {
      // Keep scanning earlier messages for a structured catalog payload.
    }
  }

  return null;
}

function gtinChecksumValid(raw) {
  const digits = cleanString(raw).replace(/\s+/g, "");
  if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length)) return false;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  let weight = 3;
  for (let i = body.length - 1; i >= 0; i -= 1) {
    sum += Number(body[i]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return ((10 - (sum % 10)) % 10) === expected;
}

function safePayanAgentError(value) {
  const text = value instanceof Error ? value.message : String(value || "unknown_error");
  return text.replace(/pk_live_[A-Za-z0-9_-]+/g, "pk_live_REDACTED").slice(0, 500);
}

async function payanAgentJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    throw new Error(
      `PayanAgent HTTP ${response.status}: ${JSON.stringify(body).slice(0, 700)}`
    );
  }
  return body;
}

async function existingPayanAgentOffer() {
  const url = new URL("/api/v1/discover", PAYANAGENT_BASE);
  url.searchParams.set("q", PAYANAGENT_OFFER_TITLE);
  url.searchParams.set("offerType", "api");
  url.searchParams.set("limit", "50");
  const body = await payanAgentJson(url);
  const offers = Array.isArray(body?.offers) ? body.offers : [];
  return (
    offers.find(
      (offer) =>
        String(offer?.title || "").trim() === PAYANAGENT_OFFER_TITLE &&
        String(offer?.endpoint || "").replace(/\/$/, "") === PAYANAGENT_OFFER_ENDPOINT
    ) || null
  );
}

async function startPayanAgentBootstrap() {
  if (!PAYANAGENT_BOOTSTRAP) return;
  payanAgentState = {
    enabled: true,
    status: "checking",
    agent_id: null,
    offer_id: null,
    checked_at: nowIso(),
    error: null,
  };

  if (!/^0x[a-fA-F0-9]{40}$/.test(BASE_PAYOUT_ADDRESS)) {
    payanAgentState = {
      ...payanAgentState,
      status: "blocked",
      checked_at: nowIso(),
      error: "PAL_BASE_PAYOUT_ADDRESS is missing or invalid",
    };
    console.error("[payanagent] bootstrap blocked: invalid payout address");
    return;
  }

  try {
    const existing = await existingPayanAgentOffer();
    if (existing?._id) {
      payanAgentState = {
        enabled: true,
        status: "already_live",
        agent_id: existing.sellerId || null,
        offer_id: existing._id,
        checked_at: nowIso(),
        error: null,
      };
      console.log(
        `[payanagent] existing offer found offer_id=${existing._id} seller_id=${existing.sellerId || "unknown"}`
      );
      return;
    }
  } catch (error) {
    console.warn("[payanagent] discovery precheck failed:", safePayanAgentError(error));
  }

  try {
    payanAgentState = { ...payanAgentState, status: "registering", checked_at: nowIso() };
    const registered = await payanAgentJson(`${PAYANAGENT_BASE}/api/v1/agents`, {
      method: "POST",
      body: JSON.stringify({
        name: "Practical Automation Lab Catalog API",
        description:
          "Deterministic product-catalog and feed identifier auditing for autonomous commerce agents. Checks duplicate IDs, GTIN format/checksum, URLs, price shape, availability, and brand/MPN consistency.",
        walletAddress: BASE_PAYOUT_ADDRESS,
        chain: "base",
        tags: ["catalog", "product-feed", "ecommerce", "data-quality"],
        providerType: "api",
        agentUrl: PUBLIC_BASE_URL,
      }),
    });

    const apiKey = String(registered?.apiKey || "");
    const agentId = String(registered?.agentId || "");
    if (!apiKey.startsWith("pk_") || !agentId) {
      throw new Error("PayanAgent registration returned no usable agentId/apiKey");
    }

    payanAgentState = {
      ...payanAgentState,
      status: "listing",
      agent_id: agentId,
      checked_at: nowIso(),
    };

    const created = await payanAgentJson(`${PAYANAGENT_BASE}/api/v1/offers`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        title: PAYANAGENT_OFFER_TITLE,
        description:
          "Deterministic product-feed row QA for identifiers, duplicate IDs, URL shape, price formatting, availability, GTIN checksum, and brand/MPN consistency. Accepts 1-100 records and returns structured row-level findings. No LLM and no merchant credentials.",
        category: "Data",
        tags: ["catalog", "product-feed", "ecommerce", "validation"],
        priceCents: 1,
        offerType: "api",
        endpoint: PAYANAGENT_OFFER_ENDPOINT,
        httpMethod: "POST",
        inputSchema:
          '{"records":[{"id":"sku-100","title":"Example Product","link":"https://example.com/p/sku-100","image_link":"https://example.com/i/sku-100.jpg","gtin":"4006381333931","brand":"Example","mpn":"SKU-100","price":"19.99 USD","availability":"in_stock","identifier_exists":true}]}',
        outputSchema:
          '{"ok":true,"record_count":1,"issue_count":0,"error_count":0,"warning_count":0,"issues":[],"generated_at":"ISO-8601"}',
        estimatedDurationSeconds: 2,
      }),
    });

    const offerId = String(created?.offerId || "");
    if (!offerId) throw new Error("PayanAgent offer creation returned no offerId");

    payanAgentState = {
      enabled: true,
      status: "live",
      agent_id: agentId,
      offer_id: offerId,
      checked_at: nowIso(),
      error: null,
    };
    console.log(`[payanagent] live agent_id=${agentId} offer_id=${offerId}`);
  } catch (error) {
    payanAgentState = {
      ...payanAgentState,
      status: "failed",
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[payanagent] bootstrap failed:", safePayanAgentError(error));
  }
}

function catalogAuditExample() {
  return {
    records: [
      {
        id: "sku-100",
        title: "Example Product",
        link: "https://example.com/products/sku-100",
        image_link: "https://example.com/images/sku-100.jpg",
        gtin: "4006381333931",
        brand: "Example",
        mpn: "SKU-100",
        price: "19.99 USD",
        availability: "in_stock",
        identifier_exists: true,
      },
    ],
  };
}

function x402Manifest() {
  return {
    spec: "agent402-service-manifest/1",
    version: 1,
    name: "Practical Automation Lab",
    summary:
      "Deterministic catalog and product-feed validation for autonomous commerce agents.",
    homepage: PUBLIC_BASE_URL,
    repository:
      "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
    resources: [
      {
        resource: X402_AUDIT_URL,
        name: "PAL Catalog Feed Identifier Audit",
        description:
          "Audit 1-100 product-feed records for duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["records"],
          properties: {
            records: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "object" },
            },
          },
        },
        accepts: [
          {
            scheme: "exact",
            network: X402_NETWORK,
            asset: X402_ASSET,
            amount: X402_PRICE_ATOMIC,
            payTo: BASE_PAYOUT_ADDRESS,
            maxTimeoutSeconds: 60,
            extra: { name: "USD Coin", version: "2" },
          },
        ],
      },
    ],
    payment: {
      x402: {
        version: 2,
        currency: "USDC",
        networks: [X402_NETWORK],
        primaryNetwork: X402_NETWORK,
        payTo: BASE_PAYOUT_ADDRESS,
      },
    },
    capabilities: { tools: 1, categories: ["commerce", "catalog", "validation"] },
    machineReadable: {
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      status: `${PUBLIC_BASE_URL}/v1/agent402/status`,
    },
  };
}

function x402OpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "PAL Catalog Feed Identifier Audit",
      version: "1.0.0",
      description:
        "Deterministic product-feed identifier and consistency audit paid per call with x402 Base USDC.",
    },
    servers: [{ url: PUBLIC_BASE_URL }],
    paths: {
      [X402_AUDIT_PATH]: {
        post: {
          operationId: "auditCatalogFeedIdentifiers",
          summary: "Audit catalog feed identifiers and consistency",
          description:
            "Checks 1-100 product records for duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["records"],
                  properties: {
                    records: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                example: catalogAuditExample(),
              },
            },
          },
          responses: {
            "200": {
              description: "Structured audit result after successful payment.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      ok: { type: "boolean" },
                      record_count: { type: "integer" },
                      issue_count: { type: "integer" },
                      error_count: { type: "integer" },
                      warning_count: { type: "integer" },
                      issues: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "400": { description: "Invalid catalog payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": {
            protocol: "x402",
            version: 2,
            scheme: "exact",
            network: X402_NETWORK,
            asset: X402_ASSET,
            amount: X402_PRICE_ATOMIC,
            price: X402_PRICE_USD,
            payTo: BASE_PAYOUT_ADDRESS,
          },
        },
      },
    },
  };
}

async function startAgent402Bootstrap() {
  if (!AGENT402_BOOTSTRAP) return;
  agent402State = {
    enabled: true,
    status: "preflight",
    listed: false,
    checked_at: nowIso(),
    seller: null,
    error: null,
  };

  try {
    const probe = await fetch(X402_AUDIT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(catalogAuditExample()),
      signal: AbortSignal.timeout(20_000),
    });
    const challenge =
      probe.headers.get("payment-required") ||
      probe.headers.get("x-payment-required");
    if (probe.status !== 402 || !challenge) {
      const body = await probe.text();
      throw new Error(
        `x402 preflight expected HTTP 402 + PAYMENT-REQUIRED, got ${probe.status}: ${body.slice(0, 300)}`
      );
    }

    agent402State = {
      ...agent402State,
      status: "registering",
      checked_at: nowIso(),
    };

    const response = await fetch(AGENT402_REGISTER_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ origin: PUBLIC_BASE_URL }),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1000) };
    }
    if (!response.ok || body?.listed !== true) {
      throw new Error(
        `Agent402 registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 900)}`
      );
    }

    agent402State = {
      enabled: true,
      status: "live",
      listed: true,
      checked_at: nowIso(),
      seller: body.seller || { origin: body.origin || PUBLIC_BASE_URL },
      error: null,
    };
    console.log(
      `[agent402] listed origin=${PUBLIC_BASE_URL} tools=${body?.seller?.toolCount ?? body?.seller?.tools ?? "unknown"}`
    );
  } catch (error) {
    agent402State = {
      ...agent402State,
      status: "failed",
      listed: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[agent402] bootstrap failed:", safePayanAgentError(error));
  }
}

function audit(records) {
  const issues = [];
  const ids = new Map();
  const allowedAvailability = new Set([
    "in_stock",
    "out_of_stock",
    "preorder",
    "backorder",
  ]);

  records.forEach((record, index) => {
    const row = record && typeof record === "object" && !Array.isArray(record) ? record : {};
    const id = cleanString(row.id);
    const title = cleanString(row.title);
    const link = cleanString(row.link);
    const imageLink = cleanString(row.image_link);
    const gtin = cleanString(row.gtin).replace(/\s+/g, "");
    const brand = cleanString(row.brand);
    const mpn = cleanString(row.mpn);
    const price = cleanString(row.price);
    const availability = cleanString(row.availability).toLowerCase();

    const add = (code, field, message, severity = "error") => {
      issues.push({ index, id: id || null, severity, code, field, message });
    };

    if (!id) add("ID_MISSING", "id", "Product id is empty.");
    if (!title) add("TITLE_MISSING", "title", "Product title is empty.");

    if (id) {
      if (ids.has(id)) {
        add("ID_DUPLICATE", "id", `Duplicate id; first seen at row ${ids.get(id)}.`);
      } else {
        ids.set(id, index);
      }
    }

    if (link && !validHttpUrl(link)) {
      add("LINK_INVALID", "link", "Product link must be an absolute HTTP(S) URL.");
    }
    if (imageLink && !validHttpUrl(imageLink)) {
      add("IMAGE_LINK_INVALID", "image_link", "Image link must be an absolute HTTP(S) URL.");
    }

    if (gtin) {
      if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) {
        add("GTIN_FORMAT_INVALID", "gtin", "GTIN must contain 8, 12, 13, or 14 digits.");
      } else if (!gtinChecksumValid(gtin)) {
        add("GTIN_CHECKSUM_INVALID", "gtin", "GTIN checksum does not validate.");
      }
    }

    if (mpn && !brand) {
      add("BRAND_MISSING_FOR_MPN", "brand", "Brand is missing while MPN is present.", "warning");
    }

    if (row.identifier_exists === true && !gtin && !mpn) {
      add(
        "IDENTIFIER_MISSING",
        "gtin",
        "identifier_exists is true but neither GTIN nor MPN is present."
      );
    }

    if (price && !/^\d+(?:\.\d{1,4})?\s[A-Z]{3}$/.test(price)) {
      add(
        "PRICE_FORMAT_INVALID",
        "price",
        "Price should look like '19.99 USD' with an uppercase 3-letter currency."
      );
    }

    if (availability && !allowedAvailability.has(availability)) {
      add(
        "AVAILABILITY_UNRECOGNIZED",
        "availability",
        "Availability should be in_stock, out_of_stock, preorder, or backorder.",
        "warning"
      );
    }
  });

  const errors = issues.filter((x) => x.severity === "error").length;
  const warnings = issues.filter((x) => x.severity === "warning").length;

  return {
    ok: errors === 0,
    record_count: records.length,
    issue_count: issues.length,
    error_count: errors,
    warning_count: warnings,
    issues,
  };
}

async function verifyPayment(hash) {
  const url = new URL(VERIFY_BASE);
  url.searchParams.set("hash", hash);
  url.searchParams.set("to", PAY_TO);
  url.searchParams.set("min_raw", PRICE_RAW);

  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Practical-Automation-Lab-Nano-Seller/1.0",
    },
    signal: AbortSignal.timeout(12_000),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 404) {
    return { ok: false, reason: "payment_not_found", detail: body };
  }
  if (!response.ok) {
    throw new Error(`verification upstream returned HTTP ${response.status}`);
  }
  if (!body?.ok || body?.confirmed !== true || body?.subtype !== "send") {
    return {
      ok: false,
      reason: body?.reason || "payment_not_valid",
      detail: body,
    };
  }
  return { ok: true, detail: body };
}

app.get("/", (_req, res) => {
  res.json({
    service: "PAL Catalog Identifier Audit",
    version: "1.0.0",
    description:
      "Deterministic product-catalog identifier and feed consistency audit, paid in Nano.",
    paid_endpoint: "POST /v1/audit",
    base_usdc_paid_endpoint: "POST /v1/usdc/catalog-audit",
    agentpay_endpoint: "POST /v1/agentpay",
    free_endpoints: ["GET /health", "GET /v1/price", "GET /v1/stats"],
    limits: { records_per_audit: 100, request_body: "128kb" },
    payment: {
      nano: {
        asset: "XNO",
        network: "nano:mainnet",
        scheme: "pal-nano-hash-v1",
        price_nano: PRICE_NANO,
        price_raw: PRICE_RAW,
        pay_to: PAY_TO,
        retry_header: "X-Nano-Payment",
      },
      base_usdc: {
        asset: "USDC",
        network: USDC_X402_NETWORK,
        scheme: "exact",
        price_usd: USDC_X402_PRICE,
        pay_to: BASE_PAYOUT_ADDRESS,
        endpoint: USDC_X402_ENDPOINT,
        facilitator: "https://facilitator.payai.network",
      },
    },
    source: "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
  });
});

app.get("/.well-known/x402", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(x402Manifest());
});

app.get("/openapi.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(x402OpenApi());
});

app.get("/v1/agent402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "Agent402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    facilitator: X402_FACILITATOR_URL,
    ...agent402State,
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pal-nano-catalog-identifier-audit", time: nowIso() });
});

app.get("/v1/price", (_req, res) => {
  res.json({
    asset: "XNO",
    network: "nano:mainnet",
    scheme: "pal-nano-hash-v1",
    price_nano: PRICE_NANO,
    price_raw: PRICE_RAW,
    pay_to: PAY_TO,
  });
});

app.get("/v1/stats", (_req, res) => {
  res.json({
    paid_audits_since_process_start: paidAudits,
    payment_hashes_consumed_since_process_start: usedPayments.size,
    uptime_seconds: Math.floor(process.uptime()),
  });
});

app.get("/v1/preflight", async (_req, res) => {
  const target = `http://127.0.0.1:${PORT}/v1/audit`;
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        records: [{
          id: "preflight-sku",
          title: "Preflight Product",
          link: "https://example.com/products/preflight-sku",
          image_link: "https://example.com/images/preflight-sku.jpg",
          gtin: "4006381333931",
          brand: "Example",
          mpn: "PREFLIGHT-SKU",
          price: "19.99 USD",
          availability: "in_stock",
          identifier_exists: true
        }]
      }),
      signal: AbortSignal.timeout(5000)
    });
    const body = await response.json();
    res.status(response.status === 402 ? 200 : 500).json({
      ok: response.status === 402,
      observed_status: response.status,
      observed_body: body
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: "preflight_failed" });
  }
});

app.post("/v1/agentpay", (req, res) => {
  const records = extractAgentPayRecords(req.body?.messages);

  if (!records) {
    return res.json({
      ok: false,
      ready: true,
      service: "PAL Catalog Identifier Audit",
      error: "catalog_payload_required",
      detail:
        "Send a messages array whose message content is JSON containing {\"records\":[...]} or a JSON array of records.",
      limits: { records_per_audit: 100 },
      example: {
        messages: [
          {
            role: "user",
            content:
              "{\"records\":[{\"id\":\"sku-100\",\"title\":\"Example Product\",\"gtin\":\"4006381333931\",\"brand\":\"Example\",\"mpn\":\"SKU-100\",\"price\":\"19.99 USD\",\"availability\":\"in_stock\",\"identifier_exists\":true}]}",
          },
        ],
      },
    });
  }

  if (records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Catalog payload must contain 1 to 100 records.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    marketplace: {
      provider: "AgentStore",
      billing: "handled_upstream",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.get("/v1/payanagent/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "PayanAgent",
    payout_network: "base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS || null,
    offer_endpoint: PAYANAGENT_OFFER_ENDPOINT,
    ...payanAgentState,
  });
});

app.post("/v1/usdc/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/payanagent/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    marketplace: {
      provider: "PayanAgent",
      billing: "handled_upstream",
      seller_wallet: BASE_PAYOUT_ADDRESS || null,
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post(X402_AUDIT_PATH, (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const result = audit(records);
  return res.json({
    ...result,
    payment: {
      protocol: "x402",
      network: X402_NETWORK,
      asset: "USDC",
      price_usd: 0.01,
      pay_to: BASE_PAYOUT_ADDRESS,
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/audit", async (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  const paymentHash = cleanString(req.get("X-Nano-Payment")).toUpperCase();
  if (!paymentHash) return paymentRequired(res);
  if (!/^[0-9A-F]{64}$/.test(paymentHash)) {
    return paymentRequired(res, "payment_hash_invalid", "Expected a 64-character Nano block hash.");
  }
  if (usedPayments.has(paymentHash) || inFlightPayments.has(paymentHash)) {
    return paymentRequired(res, "payment_reused", "This payment hash has already been consumed.");
  }

  inFlightPayments.add(paymentHash);
  try {
    const verified = await verifyPayment(paymentHash);
    if (!verified.ok) {
      return paymentRequired(res, verified.reason, verified.detail);
    }

    usedPayments.set(paymentHash, { consumed_at: nowIso() });
    paidAudits += 1;

    const result = audit(records);
    return res.json({
      ...result,
      payment: {
        verified: true,
        hash: paymentHash,
        amount_raw: verified.detail?.amount_raw || null,
        amount_nano: verified.detail?.amount_nano || null,
        from: verified.detail?.from || null,
        to: PAY_TO,
      },
      generated_at: nowIso(),
      disclaimer:
        "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
    });
  } catch (error) {
    console.error("payment verification failed", error);
    return res.status(503).json({
      error: "payment_verification_unavailable",
      detail: "Payment was not consumed. Retry when verification is available.",
    });
  } finally {
    inFlightPayments.delete(paymentHash);
  }
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large") {
    return res.status(413).json({ error: "request_too_large" });
  }
  if (error instanceof SyntaxError) {
    return res.status(400).json({ error: "invalid_json" });
  }
  console.error(error);
  return res.status(500).json({ error: "internal_error" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`PAL Nano seller listening on :${PORT}; pay_to=${PAY_TO}`);
  void startPayanAgentBootstrap();
  setTimeout(() => void startAgent402Bootstrap(), 2_000);
});
