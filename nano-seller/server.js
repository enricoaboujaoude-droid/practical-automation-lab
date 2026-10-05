import express from "express";
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";

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
const X402_AUDIT_PATH = "/v1/usdc/catalog-audit";
const X402_GTIN_PATH = "/v1/usdc/gtin-check";
const X402_GTIN_ONE_PATH = "/v1/usdc/gtin-check-one";
const X402_FEED_DIFF_PATH = "/v1/usdc/feed-diff";
const X402_VALIDATE_PATH = "/v1/usdc/x402-validate";
const X402_VALIDATE_PRICE_USD = "$0.05";
const X402_VALIDATE_PRICE_ATOMIC = "50000";
const X402_REMEDIATE_PATH = "/v1/usdc/catalog-remediation";
const X402_REMEDIATE_PRICE_USD = "$1.00";
const X402_REMEDIATE_PRICE_ATOMIC = "1000000";
const X402_REMEDIATE_BATCH_PATH = "/v1/usdc/catalog-remediation-batch";
const X402_REMEDIATE_BATCH_PRICE_USD = "$5.00";
const X402_REMEDIATE_BATCH_PRICE_ATOMIC = "5000000";
const X402_REMEDIATE_CANARY_PATH = "/v1/usdc/catalog-remediation-canary";
const X402_REMEDIATE_CANARY_PRICE_USD = "$0.10";
const X402_REMEDIATE_CANARY_PRICE_ATOMIC = "100000";
const X402_AUDIT_URL = `${PUBLIC_BASE_URL}${X402_AUDIT_PATH}`;
const X402_GTIN_URL = `${PUBLIC_BASE_URL}${X402_GTIN_PATH}`;
const X402_GTIN_ONE_URL = `${PUBLIC_BASE_URL}${X402_GTIN_ONE_PATH}`;
const X402_FEED_DIFF_URL = `${PUBLIC_BASE_URL}${X402_FEED_DIFF_PATH}`;
const X402_VALIDATE_URL = `${PUBLIC_BASE_URL}${X402_VALIDATE_PATH}`;
const X402_REMEDIATE_URL = `${PUBLIC_BASE_URL}${X402_REMEDIATE_PATH}`;
const X402_REMEDIATE_BATCH_URL = `${PUBLIC_BASE_URL}${X402_REMEDIATE_BATCH_PATH}`;
const X402_REMEDIATE_CANARY_URL = `${PUBLIC_BASE_URL}${X402_REMEDIATE_CANARY_PATH}`;
const AGENT402_BOOTSTRAP = process.env.AGENT402_BOOTSTRAP === "1";
const AGENT402_REGISTER_URL = "https://agent402.tools/api/index/register";
const INDEX402_BOOTSTRAP = process.env.INDEX402_BOOTSTRAP === "1";
const INDEX402_REGISTER_URL = "https://402index.io/api/v1/register";
const INDEX402_CLAIM_BOOTSTRAP = process.env.INDEX402_CLAIM_BOOTSTRAP === "1";
const INDEX402_CLAIM_URL = "https://402index.io/api/v1/claim";
const INDEX402_CLAIM_VERIFY_URL = "https://402index.io/api/v1/claim/verify";
const INDEX402_SERVICE_ID = "760dafd0-10d1-4db9-9688-efbd184cb46f";
const INDEX402_DOMAIN = "pal-nano-catalog-audit.onrender.com";
const X402SCOUT_BOOTSTRAP = process.env.X402SCOUT_BOOTSTRAP === "1";
const X402SCOUT_REGISTER_URL = "https://x402scout.com/register";
const AGENTTOOLS_BOOTSTRAP = process.env.AGENTTOOLS_BOOTSTRAP === "1";
const AGENTTOOLS_REGISTER_URL = "https://agent-tools.cloud/api/v1/submit";
const AGENTTOOLS_KEYS_URL = "https://agent-tools.cloud/api/v1/keys";
const AGENTTOOLS_CLAIMS_URL = "https://agent-tools.cloud/api/v1/claims";
const AGENTTOOLS_HOST = new URL(PUBLIC_BASE_URL).hostname;
const AGENTTOOLS_VERIFY_TOKEN = String(process.env.AGENTTOOLS_VERIFY_TOKEN || "").trim();
const OPENDEXTER_AUDITION_BOOTSTRAP = process.env.OPENDEXTER_AUDITION_BOOTSTRAP === "1";
const OPENDEXTER_AUDITION_URL = "https://x402.dexter.cash/api/public/discoverable";
const TRUE402_BOOTSTRAP = process.env.TRUE402_BOOTSTRAP === "1";
const TRUE402_SERVICES_URL = "https://true402.dev/api/v1/services";
const TRUE402_REGISTER_URL = "https://true402.dev/api/v1/services/register";
const MARKET402_BOOTSTRAP = process.env.MARKET402_BOOTSTRAP === "1";
const MARKET402_SUBMIT_URL = "https://market402.com/submit";
const X402DASH_REGISTER_URL = "https://api.x402dash.com/v1/register";
const NOHUMANS_LISTINGS_URL = "https://nohumans.directory/v1/listings";
const NOHUMANS_API_LISTINGS_URL = "https://api.nohumans.directory/v1/listings";
const USDC_X402_ENDPOINT = `${PUBLIC_BASE_URL}/v1/usdc/catalog-audit`;
const USDC_X402_PRICE = "$0.01";
const USDC_X402_NETWORK = "eip155:8453";

if (!/^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/.test(PAY_TO)) {
  throw new Error("NANO_ADDRESS must be a valid public Nano address");
}
if (!/^0x[a-fA-F0-9]{40}$/.test(BASE_PAYOUT_ADDRESS)) {
  throw new Error("PAL_BASE_PAYOUT_ADDRESS must be a valid public EVM address");
}

function mcpText(value) {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

async function mcpPaidRequest({ method = "POST", path, query = null, body = null, paymentSignature = "" }) {
  const url = new URL(path, `${PUBLIC_BASE_URL}/`);
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && String(value) !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = { accept: "application/json" };
  if (body !== null) headers["content-type"] = "application/json";
  if (paymentSignature) headers["PAYMENT-SIGNATURE"] = paymentSignature;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await response.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { raw };
    }

    const paymentRequired = response.headers.get("payment-required");
    const paymentResponse = response.headers.get("payment-response");

    if (response.status === 402) {
      return {
        content: mcpText({
          ok: false,
          payment_required: true,
          protocol: "x402",
          version: 2,
          network: USDC_X402_NETWORK,
          asset: "USDC",
          pay_to: BASE_PAYOUT_ADDRESS,
          resource: url.toString(),
          requirement_header: paymentRequired,
          requirement: payload,
          next_step:
            "Sign one of the returned x402 payment requirements with a compatible Base wallet, then call this same MCP tool again with payment_signature set to the resulting PAYMENT-SIGNATURE value.",
        }),
      };
    }

    if (!response.ok) {
      return {
        isError: true,
        content: mcpText({
          ok: false,
          status: response.status,
          resource: url.toString(),
          error: payload,
        }),
      };
    }

    return {
      content: mcpText({
        ok: true,
        paid: true,
        resource: url.toString(),
        payment_response: paymentResponse,
        result: payload,
      }),
    };
  } catch (error) {
    return {
      isError: true,
      content: mcpText({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

const paymentSignatureSchema = {
  type: "string",
  minLength: 1,
  description:
    "Optional x402 v2 PAYMENT-SIGNATURE value. Omit it on the first call to receive the live payment requirement; supply the signed value on the second call.",
};

function buildPalMcpServer() {
  const server = new McpServer({
    name: "pal-commerce-catalog-intelligence",
    title: "PAL Commerce Catalog Intelligence",
    version: "1.1.0",
    description:
      "Paid ecommerce catalog intelligence for Merchant Center feed audits, prioritized remediation, GTIN validation, feed changes, and x402 diagnostics.",
  });

  server.registerTool(
    "pal_service_info",
    {
      title: "PAL service and pricing",
      description:
        "Free discovery tool. Lists PAL paid commerce tools, prices, Base-USDC payout details, direct API discovery URLs, and the free remediation demo.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
    },
    async () => ({
      content: mcpText({
        service: "PAL Commerce Catalog Intelligence",
        provider: "Practical Automation Lab",
        payment: {
          protocol: "x402",
          version: 2,
          network: USDC_X402_NETWORK,
          asset: "USDC",
          pay_to: BASE_PAYOUT_ADDRESS,
        },
        paid_tools: [
          { name: "catalog_remediation", price_usd: 1.0 },
          { name: "catalog_remediation_batch", price_usd: 5.0 },
          { name: "catalog_remediation_canary", price_usd: 0.10, max_products: 1, purpose: "settlement-tested premium-offer preview" },
          { name: "catalog_audit", price_usd: 0.01 },
          { name: "gtin_check", price_usd: 0.01 },
          { name: "single_gtin_check", price_usd: 0.01 },
          { name: "feed_diff", price_usd: 0.01 },
          { name: "x402_validate", price_usd: 0.05 },
        ],
        free_demo: `${PUBLIC_BASE_URL}/v1/sample/catalog-remediation`,
        landing_page: `${PUBLIC_BASE_URL}/marketplace`,
        openapi: `${PUBLIC_BASE_URL}/openapi.json`,
        x402_manifest: `${PUBLIC_BASE_URL}/.well-known/x402`,
      }),
    }),
  );

  server.registerTool(
    "recommend_catalog_offer",
    {
      title: "Choose the best PAL paid catalog tool",
      description:
        "Free pricing/router tool. Give the number of products and whether you need remediation or audit; PAL returns the best paid route and exact price before you spend anything.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["product_count", "goal"],
        properties: {
          product_count: {
            type: "integer",
            minimum: 1,
            maximum: 500,
            description: "Number of product records you need processed.",
          },
          goal: {
            type: "string",
            enum: ["remediation", "audit"],
            description: "Use remediation for prioritized corrective actions; audit for validation findings only.",
          },
        },
        additionalProperties: false,
      }),
    },
    async ({ product_count, goal }) => {
      const count = Number(product_count);
      if (goal === "remediation") {
        const offer =
          count <= 100
            ? {
                tool: "catalog_remediation",
                route: X402_REMEDIATE_PATH,
                price_usd: 1.0,
                max_products: 100,
                reason: "Best-value remediation route for catalogs up to 100 products.",
              }
            : {
                tool: "catalog_remediation_batch",
                route: X402_REMEDIATE_BATCH_PATH,
                price_usd: 5.0,
                max_products: 500,
                reason: "Single-call batch remediation avoids splitting a 101-500 product catalog across separate purchases.",
              };
        return {
          content: mcpText({
            ok: true,
            goal,
            product_count: count,
            recommended_offer: offer,
            payment: {
              protocol: "x402",
              asset: "USDC",
              network: USDC_X402_NETWORK,
              pay_to: BASE_PAYOUT_ADDRESS,
            },
          }),
        };
      }

      const calls = Math.ceil(count / 100);
      return {
        content: mcpText({
          ok: true,
          goal,
          product_count: count,
          recommended_offer: {
            tool: "catalog_audit",
            route: X402_AUDIT_PATH,
            price_usd_per_call: 0.01,
            max_products_per_call: 100,
            calls_required: calls,
            estimated_total_usd: Number((calls * 0.01).toFixed(2)),
            reason: "Catalog audit is billed per batch of up to 100 products.",
          },
          payment: {
            protocol: "x402",
            asset: "USDC",
            network: USDC_X402_NETWORK,
            pay_to: BASE_PAYOUT_ADDRESS,
          },
        }),
      };
    },
  );

  server.registerTool(
    "free_remediation_sample",
    {
      title: "Free catalog remediation sample",
      description:
        "Returns PAL's fixed intentionally-flawed sample catalog and the prioritized remediation plan it produces. This demo does not process caller data and requires no payment.",
      inputSchema: fromJsonSchema({
        type: "object",
        properties: {},
        additionalProperties: false,
      }),
    },
    async () => {
      try {
        const response = await fetch(`${PUBLIC_BASE_URL}/v1/sample/catalog-remediation`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(15_000),
        });
        const payload = await response.json();
        return { content: mcpText(payload) };
      } catch (error) {
        return {
          isError: true,
          content: mcpText({ ok: false, error: error instanceof Error ? error.message : String(error) }),
        };
      }
    },
  );

  const recordsSchema = {
    type: "object",
    required: ["records"],
    properties: {
      records: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: { type: "object", additionalProperties: true },
      },
      payment_signature: paymentSignatureSchema,
    },
    additionalProperties: false,
  };

  server.registerTool(
    "catalog_remediation",
    {
      title: "Paid Merchant Center catalog remediation",
      description:
        "Generate a prioritized Merchant Center/product-feed remediation plan for 1-100 product records. Price: $1.00 USDC on Base via x402. First call without payment_signature returns the live payment requirement.",
      inputSchema: fromJsonSchema(recordsSchema),
    },
    async ({ records, payment_signature }) =>
      mcpPaidRequest({
        path: X402_REMEDIATE_PATH,
        body: { records },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "catalog_remediation_batch",
    {
      title: "Paid batch Merchant Center catalog remediation",
      description:
        "Generate a prioritized Merchant Center/product-feed remediation plan for 1-500 product records. Price: $5.00 USDC on Base via x402. First call without payment_signature returns the live payment requirement.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["records"],
        properties: {
          records: {
            type: "array",
            minItems: 1,
            maxItems: 500,
            items: { type: "object", additionalProperties: true },
          },
          payment_signature: paymentSignatureSchema,
        },
        additionalProperties: false,
      }),
    },
    async ({ records, payment_signature }) =>
      mcpPaidRequest({
        path: X402_REMEDIATE_BATCH_PATH,
        body: { records },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "catalog_audit",
    {
      title: "Paid catalog feed audit",
      description:
        "Audit 1-100 ecommerce product records for duplicate IDs, GTIN/checksum issues, URL shape, price formatting, availability, and identifier consistency. Price: $0.01 USDC on Base via x402.",
      inputSchema: fromJsonSchema(recordsSchema),
    },
    async ({ records, payment_signature }) =>
      mcpPaidRequest({
        path: X402_AUDIT_PATH,
        body: { records },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "gtin_check",
    {
      title: "Paid batch GTIN validation",
      description:
        "Validate 1-100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits. Price: $0.01 USDC on Base via x402.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["gtins"],
        properties: {
          gtins: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            items: { oneOf: [{ type: "string" }, { type: "number" }] },
          },
          payment_signature: paymentSignatureSchema,
        },
        additionalProperties: false,
      }),
    },
    async ({ gtins, payment_signature }) =>
      mcpPaidRequest({
        path: X402_GTIN_PATH,
        body: { gtins },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "single_gtin_check",
    {
      title: "Paid single GTIN validation",
      description:
        "Validate one GTIN/UPC/EAN identifier including its check digit. Price: $0.01 USDC on Base via x402.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["gtin"],
        properties: {
          gtin: { type: "string", minLength: 1 },
          payment_signature: paymentSignatureSchema,
        },
        additionalProperties: false,
      }),
    },
    async ({ gtin, payment_signature }) =>
      mcpPaidRequest({
        method: "GET",
        path: X402_GTIN_ONE_PATH,
        query: { gtin },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "feed_diff",
    {
      title: "Paid product feed diff",
      description:
        "Compare two product-feed snapshots and return added, removed, and changed commerce fields. Price: $0.01 USDC on Base via x402.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["before", "after"],
        properties: {
          before: {
            type: "array",
            maxItems: 100,
            items: { type: "object", additionalProperties: true },
          },
          after: {
            type: "array",
            maxItems: 100,
            items: { type: "object", additionalProperties: true },
          },
          payment_signature: paymentSignatureSchema,
        },
        additionalProperties: false,
      }),
    },
    async ({ before, after, payment_signature }) =>
      mcpPaidRequest({
        path: X402_FEED_DIFF_PATH,
        body: { before, after },
        paymentSignature: payment_signature || "",
      }),
  );

  server.registerTool(
    "x402_validate",
    {
      title: "Paid x402 v2 declaration validator",
      description:
        "Statically validate an x402 v2 payment declaration for protocol shape, Base/USDC fields, amount, recipient, timeout, and duplicate accepts. Price: $0.05 USDC on Base.",
      inputSchema: fromJsonSchema({
        type: "object",
        required: ["declaration"],
        properties: {
          declaration: { type: "object", additionalProperties: true },
          payment_signature: paymentSignatureSchema,
        },
        additionalProperties: false,
      }),
    },
    async ({ declaration, payment_signature }) =>
      mcpPaidRequest({
        path: X402_VALIDATE_PATH,
        body: declaration,
        paymentSignature: payment_signature || "",
      }),
  );

  return server;
}

const palMcpHandler = createMcpHandler(() => buildPalMcpServer());
const palMcpNodeHandler = toNodeHandler(palMcpHandler);

const app = express();
// Mount MCP before Express JSON parsing so the official MCP Node adapter owns the request stream.
app.all("/mcp", palMcpNodeHandler);

// Experimental SEP-2127 discovery metadata. The official MCP Registry remains
// the canonical listing; these documents improve domain-level crawler discovery.
app.get("/mcp/server-card", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("application/mcp-server-card+json").json({
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "io.github.enricoaboujaoude-droid/pal-commerce-catalog-intelligence",
    version: "1.1.0",
    title: "PAL Commerce Catalog Intelligence",
    description:
      "Paid Merchant Center audits, remediation, GTIN checks and feed diffs via Base USDC.",
    websiteUrl: `${PUBLIC_BASE_URL}/marketplace`,
    repository: {
      url: "https://github.com/enricoaboujaoude-droid/practical-automation-lab",
      source: "github",
      subfolder: "nano-seller",
    },
    remotes: [
      {
        type: "streamable-http",
        url: `${PUBLIC_BASE_URL}/mcp`,
      },
    ],
  });
});

app.get("/.well-known/ai-catalog.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("application/ai-catalog+json").json({
    specVersion: "1.0",
    entries: [
      {
        identifier: "urn:air:pal-nano-catalog-audit.onrender.com:mcp:commerce-catalog-intelligence",
        type: "application/mcp-server-card+json",
        url: `${PUBLIC_BASE_URL}/mcp/server-card`,
      },
    ],
  });
});
// Render terminates TLS at its reverse proxy. Trust the forwarded protocol so
// x402 middleware advertises the public HTTPS resource URL instead of the
// internal HTTP hop seen by the Node process.
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

const USDC_X402_PATHS = new Set([
  X402_AUDIT_PATH,
  X402_GTIN_PATH,
  X402_GTIN_ONE_PATH,
  X402_FEED_DIFF_PATH,
  X402_VALIDATE_PATH,
  X402_REMEDIATE_PATH,
  X402_REMEDIATE_BATCH_PATH,
  X402_REMEDIATE_CANARY_PATH,
]);

function mirrorX402PaymentRequiredBody(req, res, next) {
  if (!["GET", "POST"].includes(req.method) || !USDC_X402_PATHS.has(req.path)) {
    next();
    return;
  }

  const originalSend = res.send.bind(res);
  res.send = function sendWithMirroredPaymentRequirements(body) {
    if (res.statusCode === 402) {
      const header = res.getHeader("PAYMENT-REQUIRED") || res.getHeader("payment-required");
      if (header) {
        try {
          const encoded = Array.isArray(header) ? header[0] : String(header);
          const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
          res.type("application/json");
          return originalSend(JSON.stringify(decoded));
        } catch (error) {
          console.warn("[x402] could not mirror PAYMENT-REQUIRED into response body:", error?.message || error);
        }
      }
    }
    return originalSend(body);
  };

  next();
}

app.use(mirrorX402PaymentRequiredBody);

app.use((req, res, next) => {
  const challenge = noHumansClaimChallenges.get(req.path);
  if (challenge) res.set("x-nohumans-claim", challenge);
  next();
});

const usdcFacilitatorClient = new HTTPFacilitatorClient(facilitator);
const usdcResourceServer = new x402ResourceServer(usdcFacilitatorClient)
  .register(USDC_X402_NETWORK, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

app.use(
  paymentMiddleware(
    {
      "POST /v1/usdc/catalog-audit": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Google Merchant Center and Google Shopping product-feed audit for 1-100 catalog records: duplicate IDs, GTIN validation/checksum, URLs, prices, availability, and brand/MPN consistency.",
        mimeType: "application/json",
        serviceName: "PAL Catalog Feed Audit",
        tags: ["catalog", "product-feed", "ecommerce", "merchant-center", "gtin"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              records: [
                {
                  id: "sku-100",
                  title: "Example Product",
                  gtin: "4006381333931",
                  brand: "Example",
                  mpn: "SKU-100",
                  price: "19.99 USD",
                  availability: "in_stock",
                  identifier_exists: true,
                },
              ],
            },
            inputSchema: {
              type: "object",
              properties: {
                records: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { type: "object", additionalProperties: true },
                },
              },
              required: ["records"],
            },
            bodyType: "json",
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
      "GET /v1/usdc/gtin-check-one": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Validate one GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifier including its check digit. Pass ?gtin=...",
        mimeType: "application/json",
        serviceName: "PAL Single GTIN Check",
        tags: ["gtin", "upc", "ean", "ecommerce", "validation"],
        extensions: {
          ...declareDiscoveryExtension({
            input: { gtin: "4006381333931" },
            inputSchema: {
              type: "object",
              properties: {
                gtin: { type: "string", description: "GTIN/UPC/EAN identifier to validate." },
              },
              required: ["gtin"],
            },
            output: {
              example: {
                service: "PAL Single GTIN Check",
                result: {
                  input: "4006381333931",
                  normalized: "4006381333931",
                  length: 13,
                  checksum_valid: true,
                  valid: true,
                },
              },
            },
          }),
        },
      },
      "POST /v1/usdc/gtin-check": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits.",
        mimeType: "application/json",
        serviceName: "PAL GTIN Check",
        tags: ["gtin", "upc", "ean", "ecommerce", "validation"],
        extensions: {
          ...declareDiscoveryExtension({
            input: { gtins: ["4006381333931", "036000291452"] },
            inputSchema: {
              type: "object",
              properties: {
                gtins: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { anyOf: [{ type: "string" }, { type: "number" }] },
                },
              },
              required: ["gtins"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL GTIN Check",
                summary: { checked: 2, valid: 2, invalid: 0 },
                results: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/feed-diff": {
        accepts: [
          { scheme: "exact", price: USDC_X402_PRICE, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Compare two product-feed snapshots and return added, removed, and changed commerce fields for up to 100 rows per side.",
        mimeType: "application/json",
        serviceName: "PAL Feed Diff",
        tags: ["catalog", "product-feed", "feed-diff", "ecommerce", "change-detection"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
              after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
            },
            inputSchema: {
              type: "object",
              properties: {
                before: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                after: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
              },
              required: ["before", "after"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL Feed Diff",
                summary: { before_rows: 1, after_rows: 1, added: 0, removed: 0, changed: 1, unchanged: 0 },
                changed: [{ id: "sku-1", changes: [{ field: "price", before: "19.99 USD", after: "17.99 USD" }] }],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/catalog-remediation-canary": {
        accepts: [
          { scheme: "exact", price: X402_REMEDIATE_CANARY_PRICE_USD, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Settlement-test the PAL premium remediation product on exactly one product record. Returns the real prioritized Merchant Center/product-feed remediation result used by the $5 batch service.",
        mimeType: "application/json",
        serviceName: "PAL Batch Remediation Canary",
        tags: ["catalog", "product-feed", "ecommerce", "merchant-center", "remediation", "canary", "x402"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              records: [
                {
                  id: "sku-canary",
                  title: "Canary Product",
                  link: "https://example.com/products/sku-canary",
                  image_link: "https://example.com/images/sku-canary.jpg",
                  gtin: "4006381333931",
                  brand: "Example",
                  mpn: "SKU-CANARY",
                  price: "19.99 USD",
                  availability: "in_stock",
                  identifier_exists: true,
                },
              ],
            },
            inputSchema: {
              type: "object",
              properties: {
                records: {
                  type: "array",
                  minItems: 1,
                  maxItems: 1,
                  items: { type: "object", additionalProperties: true },
                },
              },
              required: ["records"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL Catalog Remediation Plan",
                readiness: "ready",
                summary: { records: 1, issues: 0, errors: 0, warnings: 0 },
                prioritized_actions: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/catalog-remediation-batch": {
        accepts: [
          { scheme: "exact", price: X402_REMEDIATE_BATCH_PRICE_USD, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan from 1-500 catalog records in one paid call, grouping issues by business impact and returning concrete fix actions and affected product IDs.",
        mimeType: "application/json",
        serviceName: "PAL Batch Catalog Remediation",
        tags: ["catalog", "product-feed", "ecommerce", "merchant-center", "remediation", "google-shopping", "batch"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
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
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL Catalog Remediation Plan",
                readiness: "ready",
                summary: { records: 1, issues: 0, errors: 0, warnings: 0 },
                prioritized_actions: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/catalog-remediation": {
        accepts: [
          { scheme: "exact", price: X402_REMEDIATE_PRICE_USD, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan from 1-100 catalog records, grouping issues by business impact and returning concrete fix actions and affected product IDs.",
        mimeType: "application/json",
        serviceName: "PAL Catalog Remediation Plan",
        tags: ["catalog", "product-feed", "ecommerce", "merchant-center", "remediation", "google-shopping"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
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
            },
            inputSchema: {
              type: "object",
              properties: {
                records: {
                  type: "array",
                  minItems: 1,
                  maxItems: 100,
                  items: { type: "object", additionalProperties: true },
                },
              },
              required: ["records"],
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL Catalog Remediation Plan",
                readiness: "ready",
                summary: { records: 1, errors: 0, warnings: 0, actions: 0 },
                prioritized_actions: [],
              },
            },
          }),
        },
      },
      "POST /v1/usdc/x402-validate": {
        accepts: [
          { scheme: "exact", price: X402_VALIDATE_PRICE_USD, network: USDC_X402_NETWORK, payTo: BASE_PAYOUT_ADDRESS },
        ],
        description:
          "Statically validate x402 v2 payment declarations and report protocol-shape, EVM/Base, amount, asset, recipient, timeout, and duplicate-accept findings without fetching or paying the declared resource.",
        mimeType: "application/json",
        serviceName: "PAL x402 Declaration Validator",
        tags: ["x402", "payments", "validation", "developer-tools", "usdc"],
        extensions: {
          ...declareDiscoveryExtension({
            input: {
              x402Version: 2,
              resource: { url: "https://example.com/api/data" },
              accepts: [
                {
                  scheme: "exact",
                  network: "eip155:8453",
                  amount: "10000",
                  asset: X402_ASSET,
                  payTo: BASE_PAYOUT_ADDRESS,
                  maxTimeoutSeconds: 60,
                },
              ],
            },
            inputSchema: {
              type: "object",
              additionalProperties: true,
            },
            bodyType: "json",
            output: {
              example: {
                service: "PAL x402 Declaration Validator",
                verdict: "valid",
                summary: { valid: true, errors: 0, warnings: 0, accepts_checked: 1, base_mainnet_accepts: 1 },
                findings: [],
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
let usdcPaidAudits = 0;
let usdcPaidGtinChecks = 0;
let usdcPaidSingleGtinChecks = 0;
let usdcPaidFeedDiffs = 0;
let usdcPaidX402Validations = 0;
let usdcPaidCatalogRemediations = 0;
let usdcPaidCatalogRemediationBatches = 0;
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
let index402State = {
  enabled: INDEX402_BOOTSTRAP,
  status: INDEX402_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  service: null,
  verification: null,
  error: null,
};
let index402VerificationHash = "";
let index402ClaimState = {
  enabled: INDEX402_CLAIM_BOOTSTRAP,
  status: INDEX402_CLAIM_BOOTSTRAP ? "pending" : "disabled",
  checked_at: null,
  domain_verified: false,
  services_count: null,
  service_updated: false,
  service: null,
  error: null,
};
let x402ScoutState = {
  enabled: X402SCOUT_BOOTSTRAP,
  status: X402SCOUT_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  service_id: null,
  error: null,
};
let agentToolsVerificationToken = AGENTTOOLS_VERIFY_TOKEN;
let agentToolsState = {
  enabled: AGENTTOOLS_BOOTSTRAP,
  status: AGENTTOOLS_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  owner_verified: Boolean(AGENTTOOLS_VERIFY_TOKEN),
  claim_id: null,
  listing_slug: null,
  verification_persisted: Boolean(AGENTTOOLS_VERIFY_TOKEN),
  additional_services: [],
  checked_at: null,
  service: null,
  error: null,
};
let openDexterAuditionState = {
  enabled: OPENDEXTER_AUDITION_BOOTSTRAP,
  status: OPENDEXTER_AUDITION_BOOTSTRAP ? "pending" : "disabled",
  checked_at: null,
  ok: false,
  summary: null,
  routes: [],
  error: null,
};
let true402State = {
  enabled: TRUE402_BOOTSTRAP,
  status: TRUE402_BOOTSTRAP ? "pending" : "disabled",
  registered: false,
  checked_at: null,
  listing: null,
  error: null,
};
let market402State = {
  enabled: MARKET402_BOOTSTRAP,
  status: MARKET402_BOOTSTRAP ? "pending" : "disabled",
  submitted: false,
  checked_at: null,
  result: null,
  error: null,
};
let x402DashRetryScheduled = false;
let x402DashState = {
  enabled: true,
  status: "pending",
  registered: false,
  checked_at: null,
  listings: [],
  error: null,
};
let noHumansState = {
  enabled: true,
  status: "pending",
  submitted: false,
  checked_at: null,
  listing: null,
  improvements: [],
  error: null,
};
const noHumansClaimChallenges = new Map();

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

function true402Manifest() {
  return {
    x402: "1.0",
    name: "PAL Batch Catalog Remediation",
    description:
      "Turn up to 500 ecommerce catalog records into a prioritized Google Merchant Center and product-feed remediation plan with concrete corrective actions, issue severity, and affected products.",
    capabilities: [
      "catalog-remediation",
      "merchant-center",
      "product-feed",
      "ecommerce",
      "catalog",
      "gtin",
      "validation",
    ],
    pricing: {
      currency: "USDC",
      base: "5.00",
      unit: "request",
    },
    payment: {
      address: BASE_PAYOUT_ADDRESS,
      chain: "base-mainnet",
      facilitator: X402_FACILITATOR_URL,
    },
    endpoint: X402_REMEDIATE_BATCH_URL,
    endpoints: [
      { name: "PAL Catalog Feed Identifier Audit", endpoint: X402_AUDIT_URL, method: "POST", price: "0.01" },
      { name: "PAL GTIN Check", endpoint: X402_GTIN_URL, method: "POST", price: "0.01" },
      { name: "PAL Single GTIN Check", endpoint: X402_GTIN_ONE_URL, method: "GET", price: "0.01" },
      { name: "PAL Feed Diff", endpoint: X402_FEED_DIFF_URL, method: "POST", price: "0.01" },
      { name: "PAL x402 Declaration Validator", endpoint: X402_VALIDATE_URL, method: "POST", price: "0.05" },
      { name: "PAL Catalog Remediation Plan", endpoint: X402_REMEDIATE_URL, method: "POST", price: "1.00" },
      { name: "PAL Batch Catalog Remediation", endpoint: X402_REMEDIATE_BATCH_URL, method: "POST", price: "5.00" },
    ],
  };
}

function x402Manifest() {
  const commonAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];
  const validatorAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_VALIDATE_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];
  const remediationAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_REMEDIATE_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];
  const remediationBatchAccepts = [
    {
      scheme: "exact",
      network: X402_NETWORK,
      asset: X402_ASSET,
      amount: X402_REMEDIATE_BATCH_PRICE_ATOMIC,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 60,
      extra: { name: "USD Coin", version: "2" },
    },
  ];

  return {
    spec: "agent402-service-manifest/1",
    version: 1,
    name: "Practical Automation Lab",
    summary:
      "Deterministic paid utilities for autonomous agents: commerce-data validation plus x402 declaration diagnostics.",
    homepage: PUBLIC_BASE_URL,
    repository:
      "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
    resources: [
      {
        resource: X402_AUDIT_URL,
        name: "PAL Merchant Center Product Feed Audit",
        description:
          "Audit 1-100 Google Merchant Center / Google Shopping product-feed records for duplicate IDs, GTIN validation/checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["records"],
          properties: {
            records: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_GTIN_ONE_URL,
        name: "PAL Single GTIN Check",
        description:
          "Validate one GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 product identifier including its check digit using a simple GET query.",
        method: "GET",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["gtin"],
          properties: {
            gtin: { type: "string" },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_GTIN_URL,
        name: "PAL GTIN Check",
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["gtins"],
          properties: {
            gtins: { type: "array", minItems: 1, maxItems: 100, items: {} },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_FEED_DIFF_URL,
        name: "PAL Feed Diff",
        description:
          "Compare two product-feed snapshots and return added, removed, and changed commerce fields for up to 100 rows per side.",
        method: "POST",
        price: X402_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["before", "after"],
          properties: {
            before: { type: "array", maxItems: 100, items: { type: "object" } },
            after: { type: "array", maxItems: 100, items: { type: "object" } },
          },
        },
        accepts: commonAccepts,
      },
      {
        resource: X402_VALIDATE_URL,
        name: "PAL x402 Declaration Validator",
        description:
          "Statically validate x402 v2 declarations for protocol shape, payment requirements, Base/EVM address fields, atomic amounts, timeouts, duplicate accepts, and Base-USDC readiness.",
        method: "POST",
        price: X402_VALIDATE_PRICE_USD,
        inputSchema: { type: "object", additionalProperties: true },
        accepts: validatorAccepts,
      },
      {
        resource: X402_REMEDIATE_URL,
        name: "PAL Catalog Remediation Plan",
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan for 1-100 catalog records, including concrete corrective actions and affected products.",
        method: "POST",
        price: X402_REMEDIATE_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["records"],
          properties: {
            records: { type: "array", minItems: 1, maxItems: 100, items: { type: "object" } },
          },
        },
        accepts: remediationAccepts,
      },
      {
        resource: X402_REMEDIATE_BATCH_URL,
        name: "PAL Batch Catalog Remediation",
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan for 1-500 catalog records in one paid call.",
        method: "POST",
        price: X402_REMEDIATE_BATCH_PRICE_USD,
        inputSchema: {
          type: "object",
          required: ["records"],
          properties: {
            records: { type: "array", minItems: 1, maxItems: 500, items: { type: "object" } },
          },
        },
        accepts: remediationBatchAccepts,
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
    capabilities: {
      tools: 7,
      categories: [
        "commerce",
        "merchant-feed",
        "product-feed",
        "catalog-validation",
        "catalog-remediation",
        "gtin",
        "feed-diff",
        "x402",
        "payments",
        "developer-tools",
      ],
    },
    machineReadable: {
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      status: `${PUBLIC_BASE_URL}/v1/agent402/status`,
    },
  };
}

function x402OpenApi() {
  const paymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_PRICE_ATOMIC,
    price: X402_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };

  const validatorPaymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_VALIDATE_PRICE_ATOMIC,
    price: X402_VALIDATE_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };

  const remediationPaymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_REMEDIATE_PRICE_ATOMIC,
    price: X402_REMEDIATE_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };
  const remediationBatchPaymentInfo = {
    protocol: "x402",
    version: 2,
    scheme: "exact",
    network: X402_NETWORK,
    asset: X402_ASSET,
    amount: X402_REMEDIATE_BATCH_PRICE_ATOMIC,
    price: X402_REMEDIATE_BATCH_PRICE_USD,
    payTo: BASE_PAYOUT_ADDRESS,
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "PAL Commerce Data x402 API",
      version: "1.4.0",
      description:
        "Deterministic utilities paid per call with x402 Base USDC: catalog audit, GTIN validation, product-feed diff, x402 declaration validation, and standard or batch prioritized catalog remediation.",
    },
    servers: [{ url: PUBLIC_BASE_URL }],
    paths: {
      [X402_AUDIT_PATH]: {
        post: {
          operationId: "auditCatalogFeedIdentifiers",
          summary: "Google Merchant Center and product feed audit",
          tags: ["ecommerce", "merchant-feed", "google-shopping", "catalog-validation", "gtin"],
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
            "200": { description: "Structured audit result after successful payment." },
            "400": { description: "Invalid catalog payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_GTIN_ONE_PATH]: {
        get: {
          operationId: "validateSingleGtin",
          summary: "Validate one GTIN/UPC/EAN identifier",
          tags: ["ecommerce", "gtin", "upc", "ean", "validation"],
          parameters: [
            {
              name: "gtin",
              in: "query",
              required: true,
              schema: { type: "string" },
              example: "4006381333931",
            },
          ],
          responses: {
            "200": { description: "Single GTIN validation result after successful payment." },
            "400": { description: "Missing or invalid GTIN query." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_GTIN_PATH]: {
        post: {
          operationId: "validateGtins",
          summary: "Validate GTIN/UPC/EAN identifiers",
          tags: ["ecommerce", "gtin", "upc", "ean", "validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["gtins"],
                  properties: {
                    gtins: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: { anyOf: [{ type: "string" }, { type: "number" }] },
                    },
                  },
                },
                example: { gtins: ["4006381333931", "036000291452"] },
              },
            },
          },
          responses: {
            "200": { description: "GTIN validation result after successful payment." },
            "400": { description: "Invalid GTIN payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_FEED_DIFF_PATH]: {
        post: {
          operationId: "diffProductFeedSnapshots",
          summary: "Compare product-feed snapshots",
          tags: ["ecommerce", "product-feed", "change-detection"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["before", "after"],
                  properties: {
                    before: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                    after: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
                  },
                },
                example: {
                  before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
                  after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
                },
              },
            },
          },
          responses: {
            "200": { description: "Feed diff after successful payment." },
            "400": { description: "Invalid feed-diff payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": paymentInfo,
        },
      },
      [X402_REMEDIATE_BATCH_PATH]: {
        post: {
          operationId: "remediateCatalogFeedBatch",
          summary: "Generate a prioritized remediation plan for up to 500 products",
          tags: ["ecommerce", "merchant-feed", "google-shopping", "catalog-remediation", "batch"],
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
                      maxItems: 500,
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                example: catalogAuditExample(),
              },
            },
          },
          responses: {
            "200": { description: "Batch remediation plan after successful payment." },
            "400": { description: "Invalid catalog payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": remediationBatchPaymentInfo,
        },
      },
      [X402_REMEDIATE_PATH]: {
        post: {
          operationId: "remediateCatalogFeed",
          summary: "Generate a prioritized catalog remediation plan",
          tags: ["ecommerce", "merchant-feed", "google-shopping", "catalog-remediation"],
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
            "200": { description: "Prioritized remediation plan after successful payment." },
            "400": { description: "Invalid catalog payload." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": remediationPaymentInfo,
        },
      },
      [X402_VALIDATE_PATH]: {
        post: {
          operationId: "validateX402Declaration",
          summary: "Validate an x402 v2 payment declaration",
          tags: ["x402", "payments", "developer-tools", "validation"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
                example: {
                  x402Version: 2,
                  resource: { url: "https://example.com/api/data" },
                  accepts: [
                    {
                      scheme: "exact",
                      network: "eip155:8453",
                      amount: "10000",
                      asset: X402_ASSET,
                      payTo: BASE_PAYOUT_ADDRESS,
                      maxTimeoutSeconds: 60,
                    },
                  ],
                },
              },
            },
          },
          responses: {
            "200": { description: "Static x402 declaration findings after successful payment." },
            "400": { description: "Invalid request wrapper." },
            "402": { description: "x402 payment required." },
          },
          "x-payment-info": validatorPaymentInfo,
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
    const localProbeUrl = `http://127.0.0.1:${PORT}${X402_AUDIT_PATH}`;
    const probe = await fetch(localProbeUrl, {
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
        `x402 local preflight expected HTTP 402 + PAYMENT-REQUIRED, got ${probe.status}: ${body.slice(0, 300)}`
      );
    }

    agent402State = {
      ...agent402State,
      status: "waiting_public",
      checked_at: nowIso(),
    };

    let publicReady = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      try {
        const manifestResponse = await fetch(`${PUBLIC_BASE_URL}/.well-known/x402`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const manifest = manifestResponse.ok ? await manifestResponse.json() : null;
        publicReady =
          manifestResponse.ok &&
          Array.isArray(manifest?.resources) &&
          manifest.resources.some(
            (resource) =>
              String(resource?.resource || resource?.url || "") === X402_AUDIT_URL
          );
        if (publicReady) break;
      } catch {
        // Render may still be switching the public hostname to this instance.
      }
    }
    if (!publicReady) {
      throw new Error("public x402 manifest did not become ready before registration");
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

async function startIndex402Bootstrap() {
  if (!INDEX402_BOOTSTRAP) return;
  index402State = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service: null,
    verification: null,
    error: null,
  };

  const listings = [
    {
      url: X402_AUDIT_URL,
      name: "PAL Catalog Feed Identifier Audit",
      protocol: "x402",
      http_method: "POST",
      probe_body: JSON.stringify(catalogAuditExample()),
      description:
        "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
      price_usd: 0.01,
      payment_asset: "USDC",
      payment_network: "Base",
      category: "ecommerce/data-quality",
      provider: "Practical Automation Lab",
    },
    {
      url: X402_REMEDIATE_URL,
      name: "PAL Catalog Remediation Plan",
      protocol: "x402",
      http_method: "POST",
      probe_body: JSON.stringify(catalogAuditExample()),
      description:
        "Prioritized Merchant Center and product-feed remediation plan for 1-100 catalog records, including concrete corrective actions, issue severity, and affected products.",
      price_usd: 1.0,
      payment_asset: "USDC",
      payment_network: "Base",
      category: "ecommerce/catalog-remediation",
      provider: "Practical Automation Lab",
    },
  ];

  const registrationResults = [];

  try {
    for (const payload of listings) {
      const response = await fetch(INDEX402_REGISTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(45_000),
      });

      const raw = await response.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw: raw.slice(0, 1200) };
      }

      if (!response.ok && response.status !== 409) {
        registrationResults.push({
          url: payload.url,
          name: payload.name,
          ok: false,
          status: response.status,
          error: JSON.stringify(body).slice(0, 1000),
        });
        continue;
      }

      registrationResults.push({
        url: payload.url,
        name: payload.name,
        ok: true,
        status: response.status,
        service: body?.service || body?.listing || body?.data || body || null,
        verification: body?.probe || body?.verification || null,
      });
      console.log(
        `[402index] registered route=${payload.url} status=${body?.status || response.status}`
      );
    }

    const successful = registrationResults.filter((item) => item.ok);
    const failed = registrationResults.filter((item) => !item.ok);
    if (successful.length === 0) {
      throw new Error(
        `402 Index rejected all PAL listings: ${JSON.stringify(registrationResults).slice(0, 1800)}`
      );
    }

    index402State = {
      enabled: true,
      status: failed.length === 0 ? "registered" : "partial",
      registered: true,
      checked_at: nowIso(),
      service: {
        primary: successful.find((item) => item.url === X402_AUDIT_URL)?.service || null,
        additional: successful
          .filter((item) => item.url !== X402_AUDIT_URL)
          .map((item) => ({
            url: item.url,
            name: item.name,
            service: item.service,
          })),
      },
      verification: {
        primary: successful.find((item) => item.url === X402_AUDIT_URL)?.verification || null,
        additional: successful
          .filter((item) => item.url !== X402_AUDIT_URL)
          .map((item) => ({
            url: item.url,
            name: item.name,
            verification: item.verification,
          })),
      },
      error:
        failed.length === 0
          ? null
          : `${failed.length} 402 Index listing(s) failed: ${failed
              .map((item) => `${item.name} HTTP ${item.status}`)
              .join(", ")}`,
    };
  } catch (error) {
    index402State = {
      ...index402State,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[402index] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startIndex402ClaimBootstrap() {
  if (!INDEX402_CLAIM_BOOTSTRAP) return;

  let verificationToken = "";
  index402ClaimState = {
    enabled: true,
    status: "claiming",
    checked_at: nowIso(),
    domain_verified: false,
    services_count: null,
    service_updated: false,
    service: null,
    error: null,
  };

  try {
    const claimResponse = await fetch(INDEX402_CLAIM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        domain: INDEX402_DOMAIN,
        contact_email: "enricoaboujaoude@gmail.com",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const claimRaw = await claimResponse.text();
    let claimBody = {};
    try {
      claimBody = claimRaw ? JSON.parse(claimRaw) : {};
    } catch {
      claimBody = { raw: claimRaw.slice(0, 1200) };
    }
    if (!claimResponse.ok) {
      if (claimResponse.status === 409) {
        index402ClaimState = {
          ...index402ClaimState,
          status: "already_verified",
          checked_at: nowIso(),
          domain_verified: true,
          error: null,
        };
        return;
      }
      throw new Error(
        `402 Index claim HTTP ${claimResponse.status}: ${JSON.stringify(claimBody).slice(0, 1000)}`
      );
    }

    verificationToken = String(claimBody?.verification_token || "").trim();
    index402VerificationHash = String(claimBody?.verification_hash || "").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(verificationToken)) {
      throw new Error("402 Index claim returned no valid verification token");
    }
    if (!/^[a-fA-F0-9]{64}$/.test(index402VerificationHash)) {
      throw new Error("402 Index claim returned no valid verification hash");
    }

    index402ClaimState = {
      ...index402ClaimState,
      status: "verifying",
      checked_at: nowIso(),
    };

    // Give the public edge a moment to observe the in-memory .well-known hash.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const verifyResponse = await fetch(INDEX402_CLAIM_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ domain: INDEX402_DOMAIN }),
      signal: AbortSignal.timeout(30_000),
    });
    const verifyRaw = await verifyResponse.text();
    let verifyBody = {};
    try {
      verifyBody = verifyRaw ? JSON.parse(verifyRaw) : {};
    } catch {
      verifyBody = { raw: verifyRaw.slice(0, 1200) };
    }
    if (!verifyResponse.ok && verifyResponse.status !== 409) {
      throw new Error(
        `402 Index verification HTTP ${verifyResponse.status}: ${JSON.stringify(verifyBody).slice(0, 1000)}`
      );
    }

    const verified =
      verifyResponse.ok
        ? String(verifyBody?.status || "").toLowerCase() === "verified"
        : verifyResponse.status === 409;
    if (!verified) {
      throw new Error(
        `402 Index verification did not confirm domain: ${JSON.stringify(verifyBody).slice(0, 1000)}`
      );
    }

    index402ClaimState = {
      ...index402ClaimState,
      status: "updating_service",
      checked_at: nowIso(),
      domain_verified: true,
      services_count: Number.isFinite(Number(verifyBody?.services_count))
        ? Number(verifyBody.services_count)
        : null,
    };

    const patchResponse = await fetch(
      `https://402index.io/api/v1/services/${INDEX402_SERVICE_ID}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          domain: INDEX402_DOMAIN,
          verification_token: verificationToken,
          name: "PAL Catalog Feed Identifier Audit",
          description:
            "Deterministic Google Merchant Center and product-feed identifier audit for 1-100 catalog records: duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
          category: "ecommerce/catalog-validation",
          price_usd: 0.01,
          payment_asset: "USDC",
          payment_network: "Base",
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const patchRaw = await patchResponse.text();
    let patchBody = {};
    try {
      patchBody = patchRaw ? JSON.parse(patchRaw) : {};
    } catch {
      patchBody = { raw: patchRaw.slice(0, 1200) };
    }
    if (!patchResponse.ok) {
      throw new Error(
        `402 Index service update HTTP ${patchResponse.status}: ${JSON.stringify(patchBody).slice(0, 1000)}`
      );
    }

    index402ClaimState = {
      enabled: true,
      status: "verified",
      checked_at: nowIso(),
      domain_verified: true,
      services_count: Number.isFinite(Number(verifyBody?.services_count))
        ? Number(verifyBody.services_count)
        : null,
      service_updated: true,
      service: patchBody?.service || patchBody?.data || patchBody || null,
      error: null,
    };
    console.log(
      `[402index] domain verified domain=${INDEX402_DOMAIN} service=${INDEX402_SERVICE_ID}`
    );
  } catch (error) {
    index402ClaimState = {
      ...index402ClaimState,
      status: "failed",
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[402index] domain claim failed:", safePayanAgentError(error));
  } finally {
    // The raw token is intentionally never logged or exposed by an endpoint.
    verificationToken = "";
  }
}

async function startX402ScoutBootstrap() {
  if (!X402SCOUT_BOOTSTRAP) return;
  x402ScoutState = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service_id: null,
    error: null,
  };

  try {
    const response = await fetch(X402SCOUT_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        name: "PAL Catalog Feed Identifier Audit",
        url: X402_AUDIT_URL,
        price_usd: 0.01,
        category: "data",
        description:
          "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN checksum, URL shape, price formatting, availability, and brand/MPN consistency.",
        network: "base-mainnet",
        wallet: BASE_PAYOUT_ADDRESS,
        wallet_address: BASE_PAYOUT_ADDRESS,
        tags: ["catalog", "ecommerce", "product-feed", "validation"],
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }
    if (!response.ok) {
      throw new Error(
        `x402Scout registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    let remediation = null;
    try {
      const remediationResponse = await fetch(X402SCOUT_REGISTER_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          name: "PAL Catalog Remediation Plan",
          url: X402_REMEDIATE_URL,
          price_usd: 1.0,
          category: "data",
          description:
            "Prioritized Merchant Center and product-feed remediation plan for 1-100 catalog records with concrete corrective actions, severity, and affected products.",
          network: "base-mainnet",
          wallet: BASE_PAYOUT_ADDRESS,
          wallet_address: BASE_PAYOUT_ADDRESS,
          tags: ["catalog", "ecommerce", "merchant-center", "product-feed", "remediation"],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const remediationRaw = await remediationResponse.text();
      let remediationBody = {};
      try {
        remediationBody = remediationRaw ? JSON.parse(remediationRaw) : {};
      } catch {
        remediationBody = { raw: remediationRaw.slice(0, 1200) };
      }
      remediation = {
        ok: remediationResponse.ok,
        status: remediationResponse.status,
        service_id:
          remediationBody?.service_id ||
          remediationBody?.id ||
          remediationBody?.service?.id ||
          null,
        result: remediationBody,
      };
      if (remediationResponse.ok) {
        console.log(
          `[x402scout] registered remediation route=${X402_REMEDIATE_URL} service_id=${remediation.service_id || "unknown"}`
        );
      } else {
        console.warn(
          `[x402scout] remediation registration HTTP ${remediationResponse.status}: ${JSON.stringify(remediationBody).slice(0, 700)}`
        );
      }
    } catch (remediationError) {
      remediation = {
        ok: false,
        status: null,
        service_id: null,
        error: safePayanAgentError(remediationError),
      };
      console.warn(
        "[x402scout] remediation registration failed:",
        safePayanAgentError(remediationError)
      );
    }

    x402ScoutState = {
      enabled: true,
      status: body?.status || "registered",
      registered: true,
      checked_at: nowIso(),
      service_id: body?.service_id || body?.id || body?.service?.id || null,
      additional_services: remediation
        ? [{ name: "PAL Catalog Remediation Plan", url: X402_REMEDIATE_URL, ...remediation }]
        : [],
      error: null,
    };
    console.log(
      `[x402scout] registered route=${X402_AUDIT_URL} service_id=${x402ScoutState.service_id || "unknown"}`
    );
  } catch (error) {
    x402ScoutState = {
      ...x402ScoutState,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[x402scout] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startAgentToolsBootstrap() {
  if (!AGENTTOOLS_BOOTSTRAP) return;

  const readJson = async (response, limit = 1400) => {
    const raw = await response.text();
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return { raw: raw.slice(0, limit) };
    }
  };

  const bearerHeaders = (apiKey) => ({
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
  });

  agentToolsState = {
    ...agentToolsState,
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    service: null,
    error: null,
  };

  try {
    const response = await fetch(AGENTTOOLS_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        url: X402_AUDIT_URL,
        name: "PAL Catalog Feed Identifier Audit",
        description:
          "Deterministic product-feed identifier and consistency audit for 1-100 catalog records: duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, and brand/MPN consistency. Paid directly in Base USDC over x402.",
        category: "ecommerce",
        chains: ["base"],
        price_min_usdc: 0.01,
        price_max_usdc: 0.01,
        contact: "enricoaboujaoude@gmail.com",
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new Error(
        `agent-tools.cloud registration HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    const service = body?.service || body?.data || body;
    const listingSlug =
      cleanString(service?.slug) ||
      cleanString(body?.slug) ||
      "pal-nano-catalog-audit-onrender-com-sub1069";

    const additionalListings = [
      {
        url: X402_GTIN_URL,
        name: "PAL GTIN Check",
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits. Live x402 v2 endpoint; $0.01 USDC per request on Base.",
        category: "ecommerce",
        price: 0.01,
      },
      {
        url: X402_FEED_DIFF_URL,
        name: "PAL Feed Diff",
        description:
          "Compare two product-feed snapshots and return added, removed, and changed commerce fields for up to 100 rows per side. Live x402 v2 endpoint; $0.01 USDC per request on Base.",
        category: "ecommerce",
        price: 0.01,
      },
      {
        url: X402_VALIDATE_URL,
        name: "PAL x402 Declaration Validator",
        description:
          "Statically validate x402 v2 payment declarations for protocol shape, Base network, amount, asset, recipient, timeout, and duplicate accepts. Live endpoint; $0.05 USDC per request on Base.",
        category: "developer-tools",
        price: 0.05,
      },
      {
        url: X402_REMEDIATE_URL,
        name: "PAL Catalog Remediation Plan",
        description:
          "Turn a 1-100 record ecommerce catalog into a prioritized Merchant Center/product-feed remediation plan with concrete fixes, issue counts, affected products, and the underlying deterministic audit. Live x402 endpoint; $1.00 USDC per request on Base.",
        category: "ecommerce",
        price: 1.0,
      },
      {
        url: X402_REMEDIATE_BATCH_URL,
        name: "PAL Batch Catalog Remediation",
        description:
          "Turn a 1-500 record ecommerce catalog into one prioritized Merchant Center/product-feed remediation plan with concrete fixes, issue counts, affected products, and the underlying deterministic audit. Live x402 endpoint; $5.00 USDC per request on Base.",
        category: "ecommerce",
        price: 5.0,
      },
    ];

    const submitAdditionalListings = async () => {
      const results = [];
      for (const listing of additionalListings) {
        try {
          const extraResponse = await fetch(AGENTTOOLS_REGISTER_URL, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify({
              url: listing.url,
              name: listing.name,
              description: listing.description,
              category: listing.category,
              chains: ["base"],
              price_min_usdc: listing.price,
              price_max_usdc: listing.price,
              contact: "enricoaboujaoude@gmail.com",
            }),
            signal: AbortSignal.timeout(45_000),
          });
          const extraBody = await readJson(extraResponse);
          if (!extraResponse.ok) {
            results.push({
              name: listing.name,
              url: listing.url,
              status: "failed",
              error: `HTTP ${extraResponse.status}`,
            });
            continue;
          }
          const extraService = extraBody?.service || extraBody?.data || extraBody;
          results.push({
            name: listing.name,
            url: listing.url,
            status: cleanString(extraBody?.status) || "submitted",
            slug: cleanString(extraService?.slug) || cleanString(extraBody?.slug) || null,
            error: null,
          });
        } catch (error) {
          results.push({
            name: listing.name,
            url: listing.url,
            status: "failed",
            error: safePayanAgentError(error),
          });
        }
      }
      return results;
    };

    agentToolsState = {
      ...agentToolsState,
      status: cleanString(body?.status) || "registered",
      registered: true,
      listing_slug: listingSlug,
      checked_at: nowIso(),
      service,
      error: null,
    };

    // A persisted verification token means this host has already completed the
    // ownership flow. Keeping the public proof in place is required because
    // agent-tools.cloud re-checks claimed hosts daily.
    if (agentToolsVerificationToken) {
      const additionalServices = await submitAdditionalListings();
      agentToolsState = {
        ...agentToolsState,
        status: "owner_verified",
        owner_verified: true,
        verification_persisted: true,
        additional_services: additionalServices,
        checked_at: nowIso(),
      };
      console.log(
        `[agenttools] owner proof persisted host=${AGENTTOOLS_HOST} listing=${listingSlug} additional=${additionalServices.filter((item) => item.status !== "failed").length}`
      );
      return;
    }

    agentToolsState = {
      ...agentToolsState,
      status: "claiming",
      checked_at: nowIso(),
    };

    // Keys are intentionally held only in this function's local scope. They are
    // never written to logs, status endpoints, source control, or response data.
    const keyResponse = await fetch(AGENTTOOLS_KEYS_URL, {
      method: "POST",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const keyBody = await readJson(keyResponse);
    const apiKey = cleanString(keyBody?.api_key);
    if (!keyResponse.ok || !apiKey) {
      throw new Error(
        `agent-tools.cloud key mint HTTP ${keyResponse.status}: key_unavailable`
      );
    }

    const claimResponse = await fetch(AGENTTOOLS_CLAIMS_URL, {
      method: "POST",
      headers: bearerHeaders(apiKey),
      body: JSON.stringify({
        host: AGENTTOOLS_HOST,
        method: "wellknown_file",
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const claimBody = await readJson(claimResponse);
    const claimId = claimBody?.claim_id;
    const token = cleanString(claimBody?.token);
    if (!claimResponse.ok || !claimId || !/^atc_[A-Za-z0-9_-]+$/.test(token)) {
      throw new Error(
        `agent-tools.cloud claim HTTP ${claimResponse.status}: claim_or_token_unavailable`
      );
    }

    // The token is public proof by design. It is kept only in memory until the
    // operator persists it as AGENTTOOLS_VERIFY_TOKEN after successful verify.
    agentToolsVerificationToken = token;
    agentToolsState = {
      ...agentToolsState,
      status: "verifying",
      claim_id: claimId,
      verification_persisted: false,
      checked_at: nowIso(),
    };

    // Allow the public edge to observe /.well-known/agent-tools-verify.txt.
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const verifyResponse = await fetch(
      `${AGENTTOOLS_CLAIMS_URL}/${encodeURIComponent(String(claimId))}/verify`,
      {
        method: "POST",
        headers: bearerHeaders(apiKey),
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(45_000),
      }
    );
    const verifyBody = await readJson(verifyResponse, 1800);
    if (!verifyResponse.ok) {
      throw new Error(
        `agent-tools.cloud verify HTTP ${verifyResponse.status}: ${JSON.stringify(verifyBody).slice(0, 900)}`
      );
    }

    agentToolsState = {
      ...agentToolsState,
      status: "updating_listing",
      owner_verified: true,
      checked_at: nowIso(),
    };

    const patchResponse = await fetch(
      `https://agent-tools.cloud/api/v1/listings/x402/${encodeURIComponent(listingSlug)}`,
      {
        method: "PATCH",
        headers: bearerHeaders(apiKey),
        body: JSON.stringify({
          name: "PAL Catalog Feed Identifier Audit",
          description:
            "Deterministic Google Merchant Center and product-feed audit for 1-100 catalog records. Checks duplicate IDs, GTIN format/checksum, URL shape, prices, availability, and brand/MPN consistency. Live x402 v2 endpoint; $0.01 USDC per request on Base.",
          category: "ecommerce",
          url: X402_AUDIT_URL,
        }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const patchBody = await readJson(patchResponse, 1800);
    if (!patchResponse.ok) {
      throw new Error(
        `agent-tools.cloud listing update HTTP ${patchResponse.status}: ${JSON.stringify(patchBody).slice(0, 900)}`
      );
    }

    const additionalServices = await submitAdditionalListings();
    agentToolsState = {
      ...agentToolsState,
      status: "owner_verified",
      registered: true,
      owner_verified: true,
      claim_id: claimId,
      listing_slug: listingSlug,
      verification_persisted: false,
      additional_services: additionalServices,
      checked_at: nowIso(),
      service: patchBody?.listing || patchBody?.service || patchBody?.data || patchBody || service,
      error: null,
    };
    console.log(
      `[agenttools] owner verified host=${AGENTTOOLS_HOST} listing=${listingSlug}`
    );
  } catch (error) {
    agentToolsState = {
      ...agentToolsState,
      status: "failed",
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[agenttools] bootstrap failed:", safePayanAgentError(error));
  }
}

async function startOpenDexterAuditionBootstrap() {
  if (!OPENDEXTER_AUDITION_BOOTSTRAP) return;

  openDexterAuditionState = {
    enabled: true,
    status: "auditioning",
    checked_at: nowIso(),
    ok: false,
    summary: null,
    routes: [],
    error: null,
  };

  try {
    // A specific endpoint URL requests OpenDexter's immediate server-funded
    // paid verification. This does not use PAL's payout wallet as a payer.
    const response = await fetch(OPENDEXTER_AUDITION_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "identity",
      },
      body: JSON.stringify({ url: X402_AUDIT_URL }),
      signal: AbortSignal.timeout(120_000),
      redirect: "manual",
    });

    const raw = await response.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1600) };
    }

    if (!response.ok || body?.ok !== true) {
      throw new Error(
        `OpenDexter audition HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1400)}`
      );
    }

    openDexterAuditionState = {
      enabled: true,
      status: "completed",
      checked_at: nowIso(),
      ok: true,
      summary: body?.summary || null,
      routes: Array.isArray(body?.routes)
        ? body.routes.map((route) => ({
            url: route?.url || null,
            registered: route?.registered ?? null,
            auditOutcome: route?.auditOutcome || null,
            score: Number.isFinite(route?.score) ? route.score : null,
            verdict: route?.verdict || null,
            shareUrl: route?.shareUrl || null,
            incompleteReason: route?.incompleteReason || null,
          }))
        : [],
      error: null,
    };

    console.log(
      `[opendexter] audition route=${X402_AUDIT_URL} ok=true scored=${openDexterAuditionState.routes.filter((r) => Number.isFinite(r.score)).length}`
    );
  } catch (error) {
    openDexterAuditionState = {
      ...openDexterAuditionState,
      status: "failed",
      checked_at: nowIso(),
      ok: false,
      error: safePayanAgentError(error),
    };
    console.error("[opendexter] audition failed:", safePayanAgentError(error));
  }
}

async function startTrue402Bootstrap() {
  if (!TRUE402_BOOTSTRAP) return;

  true402State = {
    enabled: true,
    status: "checking",
    registered: false,
    checked_at: nowIso(),
    listing: null,
    error: null,
  };

  try {
    const listResponse = await fetch(TRUE402_SERVICES_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!listResponse.ok) {
      throw new Error(`true402 catalog HTTP ${listResponse.status}`);
    }
    const listBody = await listResponse.json();
    const listings = Array.isArray(listBody?.data) ? listBody.data : [];
    const existing =
      listings.find(
        (item) =>
          String(item?.url || "").replace(/\/$/, "") === X402_AUDIT_URL ||
          String(item?.manifest?.endpoint || "").replace(/\/$/, "") === X402_AUDIT_URL
      ) || null;

    true402State = {
      ...true402State,
      status: existing ? "refreshing" : "registering",
      registered: Boolean(existing),
      checked_at: nowIso(),
      listing: existing,
    };

    const registerResponse = await fetch(TRUE402_REGISTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ url: PUBLIC_BASE_URL }),
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await registerResponse.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { raw: raw.slice(0, 1200) };
    }

    if (!registerResponse.ok) {
      throw new Error(
        `true402 registration HTTP ${registerResponse.status}: ${JSON.stringify(body).slice(0, 1000)}`
      );
    }

    true402State = {
      enabled: true,
      status: "registered",
      registered: true,
      checked_at: nowIso(),
      listing: body?.service || body?.data || body || null,
      error: null,
    };
    console.log(
      `[true402] registered/refreshed primary=${X402_REMEDIATE_BATCH_URL} id=${body?.id || body?.service?.id || body?.data?.id || "unknown"}`
    );
  } catch (error) {
    true402State = {
      ...true402State,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[true402] bootstrap failed:", safePayanAgentError(error));
  }
}


async function submitMarket402Resource(resource) {
  const response = await fetch(MARKET402_SUBMIT_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ resource }),
    signal: AbortSignal.timeout(30_000),
  });

  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw: raw.slice(0, 1600) };
  }

  const duplicate =
    response.status === 409 ||
    body?.already_listed === true ||
    /already|duplicate|exists|submitted/i.test(JSON.stringify(body));

  if (!response.ok && !duplicate) {
    throw new Error(
      `Market402 submission HTTP ${response.status} for ${resource}: ${JSON.stringify(body).slice(0, 1200)}`
    );
  }

  return {
    resource,
    submitted: response.ok || duplicate,
    duplicate,
    status: response.status,
    result: body,
  };
}

async function startMarket402Bootstrap() {
  if (!MARKET402_BOOTSTRAP) return;

  market402State = {
    enabled: true,
    status: "submitting",
    submitted: false,
    checked_at: nowIso(),
    result: null,
    error: null,
  };

  const resources = [
    X402_AUDIT_URL,
    X402_GTIN_ONE_URL,
    X402_GTIN_URL,
    X402_FEED_DIFF_URL,
    X402_VALIDATE_URL,
    X402_REMEDIATE_URL,
    X402_REMEDIATE_BATCH_URL,
  ];
  const results = [];

  try {
    for (const resource of resources) {
      try {
        const outcome = await submitMarket402Resource(resource);
        results.push(outcome);
        console.log(
          `[market402] resource=${resource} submitted=${outcome.submitted} duplicate=${outcome.duplicate} status=${outcome.status}`
        );
      } catch (error) {
        results.push({
          resource,
          submitted: false,
          duplicate: false,
          status: null,
          error: safePayanAgentError(error),
        });
        console.error("[market402] resource submission failed:", safePayanAgentError(error));
      }
    }

    const submittedCount = results.filter((item) => item.submitted).length;
    if (submittedCount === 0) {
      throw new Error("Market402 rejected or failed all PAL resources");
    }

    market402State = {
      enabled: true,
      status: submittedCount === resources.length ? "submitted" : "partial",
      submitted: true,
      checked_at: nowIso(),
      result: {
        resources_total: resources.length,
        resources_submitted: submittedCount,
        resources: results,
      },
      error:
        submittedCount === resources.length
          ? null
          : "One or more PAL resources could not be submitted.",
    };
    console.log(
      `[market402] bootstrap complete submitted=${submittedCount}/${resources.length}`
    );
  } catch (error) {
    market402State = {
      enabled: true,
      status: "failed",
      submitted: false,
      checked_at: nowIso(),
      result: { resources: results },
      error: safePayanAgentError(error),
    };
    console.error("[market402] bootstrap failed:", safePayanAgentError(error));
  }
}


async function startX402DashBootstrap() {
  x402DashState = {
    enabled: true,
    status: "registering",
    registered: false,
    checked_at: nowIso(),
    listings: [],
    error: null,
  };

  const listings = [
    {
      url: X402_GTIN_ONE_URL,
      name: "PAL Single GTIN Check",
      description:
        "Validate one GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 product identifier including its check digit through a one-parameter paid GET endpoint.",
      category: "Data",
      tags: ["ecommerce", "gtin", "upc", "ean", "validation"],
    },
    {
      url: X402_REMEDIATE_URL,
      name: "PAL Catalog Remediation Plan",
      description:
        "Generate a prioritized Merchant Center and product-feed remediation plan for 1-100 catalog records with concrete fixes, issue severity, and affected product IDs. Paid directly over x402 Base USDC.",
      category: "Data",
      tags: ["ecommerce", "catalog", "merchant-center", "product-feed", "remediation"],
    },
  ];

  const results = [];
  try {
    for (const listing of listings) {
      const response = await fetch(X402DASH_REGISTER_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(listing),
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw: raw.slice(0, 1400) };
      }

      const duplicate =
        response.status === 409 ||
        /already|duplicate|exists/i.test(JSON.stringify(body));
      if (!response.ok && !duplicate) {
        results.push({
          url: listing.url,
          name: listing.name,
          ok: false,
          status: response.status,
          error: JSON.stringify(body).slice(0, 900),
        });
        continue;
      }

      results.push({
        url: listing.url,
        name: listing.name,
        ok: true,
        status: response.status,
        duplicate,
        result: body,
      });
      console.log(
        `[x402dash] registered route=${listing.url} status=${response.status} duplicate=${duplicate}`
      );
    }

    const success = results.filter((item) => item.ok);
    x402DashState = {
      enabled: true,
      status: success.length === listings.length ? "registered" : success.length ? "partial" : "failed",
      registered: success.length > 0,
      checked_at: nowIso(),
      listings: results,
      error:
        success.length === listings.length
          ? null
          : `${listings.length - success.length} x402dash listing(s) failed`,
    };

    const rateLimited = results.some((item) => item.status === 429);
    if (rateLimited && !x402DashRetryScheduled) {
      x402DashRetryScheduled = true;
      setTimeout(() => {
        x402DashRetryScheduled = false;
        void startX402DashBootstrap();
      }, 65 * 60_000);
      console.log("[x402dash] rate limited; one retry scheduled after 65 minutes");
    }
  } catch (error) {
    x402DashState = {
      ...x402DashState,
      status: "failed",
      registered: false,
      checked_at: nowIso(),
      listings: results,
      error: safePayanAgentError(error),
    };
    console.error("[x402dash] bootstrap failed:", safePayanAgentError(error));
  }
}

async function improveNoHumansListing({ id, path, metadata }) {
  let editToken = "";
  try {
    const challengeResponse = await fetch(
      `${NOHUMANS_API_LISTINGS_URL}/${encodeURIComponent(id)}/claim/challenge`,
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        signal: AbortSignal.timeout(30_000),
      }
    );
    const challengeRaw = await challengeResponse.text();
    let challengeBody = {};
    try {
      challengeBody = challengeRaw ? JSON.parse(challengeRaw) : {};
    } catch {
      challengeBody = { raw: challengeRaw.slice(0, 800) };
    }
    if (!challengeResponse.ok) {
      throw new Error(
        `challenge HTTP ${challengeResponse.status}: ${JSON.stringify(challengeBody).slice(0, 700)}`
      );
    }

    const challenge =
      cleanString(challengeBody?.challenge) ||
      cleanString(challengeBody?.token) ||
      cleanString(challengeBody?.challenge_token) ||
      cleanString(challengeBody?.verification_token);
    if (!challenge) throw new Error("claim challenge returned no token");
    noHumansClaimChallenges.set(path, challenge);

    const claimResponse = await fetch(
      `${NOHUMANS_API_LISTINGS_URL}/${encodeURIComponent(id)}/claim`,
      {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ email: "enricoaboujaoude@gmail.com" }),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const claimRaw = await claimResponse.text();
    let claimBody = {};
    try {
      claimBody = claimRaw ? JSON.parse(claimRaw) : {};
    } catch {
      claimBody = { raw: claimRaw.slice(0, 800) };
    }
    if (!claimResponse.ok) {
      throw new Error(
        `claim HTTP ${claimResponse.status}: ${JSON.stringify(claimBody).slice(0, 700)}`
      );
    }

    editToken =
      cleanString(claimBody?.claim_token) ||
      cleanString(claimBody?.edit_token) ||
      cleanString(claimBody?.token);
    if (!editToken) throw new Error("claim succeeded but returned no edit token");

    const patchResponse = await fetch(
      `${NOHUMANS_LISTINGS_URL}/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-claim-token": editToken,
        },
        body: JSON.stringify(metadata),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const patchRaw = await patchResponse.text();
    let patchBody = {};
    try {
      patchBody = patchRaw ? JSON.parse(patchRaw) : {};
    } catch {
      patchBody = { raw: patchRaw.slice(0, 800) };
    }
    if (!patchResponse.ok) {
      throw new Error(
        `patch HTTP ${patchResponse.status}: ${JSON.stringify(patchBody).slice(0, 700)}`
      );
    }

    return {
      id,
      ok: true,
      status: patchResponse.status,
      updated: patchBody?.updated || patchBody?.applied || null,
    };
  } catch (error) {
    return { id, ok: false, error: safePayanAgentError(error) };
  } finally {
    noHumansClaimChallenges.delete(path);
    editToken = "";
  }
}

async function improveNoHumansExistingListings() {
  const targets = [
    {
      id: "1ad8d20b-edd",
      path: X402_AUDIT_PATH,
      metadata: {
        request_schema: {
          type: "object",
          properties: {
            records: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { type: "object", additionalProperties: true },
            },
          },
          required: ["records"],
        },
        sample_query: `${PUBLIC_BASE_URL}/v1/sample/catalog-audit`,
      },
    },
    {
      id: "28cd4eed-15a",
      path: X402_GTIN_PATH,
      metadata: {
        request_schema: {
          type: "object",
          properties: {
            gtins: {
              type: "array",
              minItems: 1,
              maxItems: 100,
              items: { anyOf: [{ type: "string" }, { type: "number" }] },
            },
          },
          required: ["gtins"],
        },
        sample_query: `${PUBLIC_BASE_URL}/v1/sample/gtin-batch`,
      },
    },
    {
      id: "ca4df19d-ba5",
      path: X402_FEED_DIFF_PATH,
      metadata: {
        request_schema: {
          type: "object",
          properties: {
            before: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
            after: { type: "array", maxItems: 100, items: { type: "object", additionalProperties: true } },
          },
          required: ["before", "after"],
        },
        sample_query: `${PUBLIC_BASE_URL}/v1/sample/feed-diff`,
      },
    },
    {
      id: "134f5620-b62",
      path: X402_VALIDATE_PATH,
      metadata: {
        request_schema: {
          type: "object",
          properties: {
            x402Version: { type: "integer", default: 2 },
            resource: { type: "object", additionalProperties: true },
            accepts: {
              type: "array",
              minItems: 1,
              items: { type: "object", additionalProperties: true },
            },
          },
          required: ["x402Version", "accepts"],
        },
        sample_query: `${PUBLIC_BASE_URL}/v1/sample/x402-validate`,
      },
    },
  ];

  const results = [];
  for (const target of targets) {
    results.push(await improveNoHumansListing(target));
  }
  return results;
}

async function startNoHumansBootstrap() {
  noHumansState = {
    enabled: true,
    status: "submitting",
    submitted: false,
    checked_at: nowIso(),
    listing: null,
    error: null,
  };

  const claimToken = String(process.env.NOHUMANS_CLAIM_TOKEN || "").trim();
  const claimedListingId = String(process.env.NOHUMANS_LISTING_ID || "").trim();
  const sampleUrl = `${PUBLIC_BASE_URL}/v1/sample/gtin-check?gtin=4006381333931`;

  const listings = [
    {
      name: "PAL Single GTIN Check",
      description:
        "Deterministic GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 checksum validation for ecommerce agents. One query parameter, JSON result, paid per call over x402 Base USDC.",
      endpoint_url: `${X402_GTIN_ONE_URL}?gtin=4006381333931`,
      category: "infra.validation",
      price_amount: 0.01,
      chains: ["base"],
      request_schema: {
        type: "object",
        properties: {
          gtin: {
            type: "string",
            description: "GTIN, UPC, or EAN identifier.",
            default: "4006381333931",
          },
        },
        required: ["gtin"],
      },
      sample_query: sampleUrl,
    },
    {
      name: "PAL Catalog Feed Audit",
      description:
        "Deterministic ecommerce product-feed audit for duplicate IDs, GTIN checksums, URLs, prices, availability, and brand/MPN consistency across 1-100 records.",
      endpoint_url: X402_AUDIT_URL,
      category: "infra.validation",
      sample_query: `${PUBLIC_BASE_URL}/v1/sample/catalog-audit`,
      price_amount: 0.01,
      chains: ["base"],
      request_schema: {
        type: "object",
        properties: {
          records: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            default: [
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
            items: { type: "object", additionalProperties: true },
          },
        },
        required: ["records"],
      },
    },
    {
      name: "PAL Batch GTIN Check",
      description:
        "Validate 1-100 GTIN, UPC, or EAN identifiers in one deterministic call, including normalized value, length, check digit, and checksum validity.",
      endpoint_url: X402_GTIN_URL,
      category: "infra.validation",
      sample_query: `${PUBLIC_BASE_URL}/v1/sample/gtin-batch`,
      price_amount: 0.01,
      chains: ["base"],
      request_schema: {
        type: "object",
        properties: {
          gtins: {
            type: "array",
            minItems: 1,
            maxItems: 100,
            default: ["4006381333931"],
            items: { type: ["string", "number"] },
          },
        },
        required: ["gtins"],
      },
    },
    {
      name: "PAL Product Feed Diff",
      description:
        "Compare before/after ecommerce feed snapshots and report added, removed, changed, and unchanged products with field-level changes for deterministic catalog QA.",
      endpoint_url: X402_FEED_DIFF_URL,
      category: "infra.validation",
      sample_query: `${PUBLIC_BASE_URL}/v1/sample/feed-diff`,
      price_amount: 0.01,
      chains: ["base"],
      request_schema: {
        type: "object",
        properties: {
          before: {
            type: "array",
            maxItems: 100,
            default: [{ id: "sku-100", title: "Example Product", price: "19.99 USD" }],
            items: { type: "object", additionalProperties: true },
          },
          after: {
            type: "array",
            maxItems: 100,
            default: [{ id: "sku-100", title: "Example Product", price: "17.99 USD" }],
            items: { type: "object", additionalProperties: true },
          },
        },
        required: ["before", "after"],
      },
    },
    {
      name: "PAL x402 Declaration Validator",
      description:
        "Deterministically validate an x402 v2 PaymentRequired declaration for protocol shape, Base network, USDC asset, payTo address, amount, timeout, and duplicate payment options without making the declared payment.",
      endpoint_url: X402_VALIDATE_URL,
      category: "infra.validation",
      sample_query: `${PUBLIC_BASE_URL}/v1/sample/x402-validate`,
      price_amount: 0.05,
      chains: ["base"],
      request_schema: {
        type: "object",
        properties: {
          x402Version: { type: "integer", default: 2 },
          accepts: {
            type: "array",
            minItems: 1,
            default: [
              {
                scheme: "exact",
                network: "eip155:8453",
                asset: X402_ASSET,
                amount: "10000",
                payTo: BASE_PAYOUT_ADDRESS,
                maxTimeoutSeconds: 60,
                extra: { name: "USD Coin", version: "2" },
              },
            ],
            items: { type: "object", additionalProperties: true },
          },
        },
        required: ["x402Version", "accepts"],
      },
    },
  ];

  const results = [];
  let patchResult = null;

  try {
    if (claimToken && claimedListingId) {
      const patchResponse = await fetch(`${NOHUMANS_LISTINGS_URL}/${encodeURIComponent(claimedListingId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-claim-token": claimToken,
        },
        body: JSON.stringify({
          request_schema: listings[0].request_schema,
          sample_query: listings[0].sample_query,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const patchRaw = await patchResponse.text();
      let patchBody = {};
      try {
        patchBody = patchRaw ? JSON.parse(patchRaw) : {};
      } catch {
        patchBody = { raw: patchRaw.slice(0, 1200) };
      }
      patchResult = {
        ok: patchResponse.ok,
        status: patchResponse.status,
        result: patchBody,
      };
      if (!patchResponse.ok) {
        console.warn(
          `[nohumans] metadata patch failed listing=${claimedListingId} status=${patchResponse.status}`
        );
      } else {
        console.log(
          `[nohumans] metadata patched listing=${claimedListingId} sample=true schema=true`
        );
      }
    }

    for (const payload of listings) {
      const response = await fetch(NOHUMANS_LISTINGS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });

      const raw = await response.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { raw: raw.slice(0, 1600) };
      }

      const duplicate =
        response.status === 409 ||
        /already|duplicate|exists/i.test(JSON.stringify(body));

      if (!response.ok && !duplicate) {
        results.push({
          name: payload.name,
          endpoint_url: payload.endpoint_url,
          ok: false,
          status: response.status,
          error: JSON.stringify(body).slice(0, 1000),
        });
        continue;
      }

      const publicListing = body && typeof body === "object" ? { ...body } : body;
      if (publicListing && typeof publicListing === "object") {
        delete publicListing.claim_token;
        delete publicListing.edit_token;
        delete publicListing.token;
      }
      results.push({
        name: payload.name,
        endpoint_url: payload.endpoint_url,
        ok: true,
        duplicate,
        status: response.status,
        listing: publicListing,
      });
      console.log(
        `[nohumans] ${duplicate ? "existing" : "submitted"} name=${payload.name} status=${response.status}`
      );
    }

    const successes = results.filter((item) => item.ok);
    const failures = results.filter((item) => !item.ok);
    const publicPatch =
      patchResult && patchResult.result && typeof patchResult.result === "object"
        ? { ...patchResult, result: { ...patchResult.result } }
        : patchResult;
    if (publicPatch?.result && typeof publicPatch.result === "object") {
      delete publicPatch.result.claim_token;
      delete publicPatch.result.edit_token;
      delete publicPatch.result.token;
    }

    noHumansState = {
      enabled: true,
      status:
        successes.length === listings.length
          ? "submitted"
          : successes.length > 0
            ? "partial"
            : "failed",
      submitted: successes.length > 0,
      checked_at: nowIso(),
      listing: {
        metadata_patch: publicPatch,
        listings: results,
      },
      improvements: await improveNoHumansExistingListings(),
      error:
        failures.length === 0
          ? null
          : `${failures.length} nohumans listing(s) failed`,
    };
  } catch (error) {
    noHumansState = {
      ...noHumansState,
      status: "failed",
      submitted: false,
      checked_at: nowIso(),
      error: safePayanAgentError(error),
    };
    console.error("[nohumans] bootstrap failed:", safePayanAgentError(error));
  }
}

const FEED_DIFF_FIELDS = [
  "title",
  "link",
  "image_link",
  "price",
  "availability",
  "brand",
  "gtin",
  "mpn",
];

function gtinCheckDigit(digitsWithoutCheck) {
  let sum = 0;
  let positionFromRight = 0;
  for (let index = digitsWithoutCheck.length - 1; index >= 0; index -= 1) {
    const weight = positionFromRight % 2 === 0 ? 3 : 1;
    sum += Number(digitsWithoutCheck[index]) * weight;
    positionFromRight += 1;
  }
  return String((10 - (sum % 10)) % 10);
}

function inspectGtin(input) {
  const normalized = String(input).trim().replace(/[\s-]+/g, "");
  const numeric = /^\d+$/.test(normalized);
  const validLength = [8, 12, 13, 14].includes(normalized.length);
  if (!numeric || !validLength) {
    return {
      input: String(input),
      normalized,
      length: normalized.length,
      valid_length: validLength,
      checksum_valid: false,
      valid: false,
      reason: !numeric
        ? "GTIN must contain digits only (spaces and hyphens are ignored)."
        : "GTIN length must be 8, 12, 13, or 14 digits.",
    };
  }
  const expected = gtinCheckDigit(normalized.slice(0, -1));
  const actual = normalized.at(-1);
  const checksumValid = expected === actual;
  return {
    input: String(input),
    normalized,
    length: normalized.length,
    valid_length: true,
    check_digit_expected: expected,
    check_digit_actual: actual,
    checksum_valid: checksumValid,
    valid: checksumValid,
    reason: checksumValid ? null : "GTIN check digit does not match.",
  };
}

function gtinCheck(gtins) {
  const results = gtins.map(inspectGtin);
  const valid = results.filter((item) => item.valid).length;
  return {
    service: "PAL GTIN Check",
    generated_at: nowIso(),
    summary: { checked: results.length, valid, invalid: results.length - valid },
    results,
  };
}

function feedRowError(rows, label) {
  if (!Array.isArray(rows) || rows.length > 100) {
    return `${label} must be an array with at most 100 rows.`;
  }
  const seen = new Set();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label}[${index}] must be an object.`;
    }
    const id = String(row.id ?? "").trim();
    if (!id) return `${label}[${index}].id is required.`;
    if (seen.has(id)) return `${label} contains duplicate id "${id}".`;
    seen.add(id);
  }
  return null;
}

function feedFieldValue(row, field) {
  if (!(field in row) || row[field] === null || row[field] === undefined) return null;
  if (typeof row[field] === "string") return row[field].trim();
  if (typeof row[field] === "number" || typeof row[field] === "boolean") return row[field];
  return JSON.stringify(row[field]);
}

function feedDiff(beforeRows, afterRows) {
  const before = new Map(beforeRows.map((row) => [String(row.id).trim(), row]));
  const after = new Map(afterRows.map((row) => [String(row.id).trim(), row]));
  const added = [...after.keys()].filter((id) => !before.has(id)).sort();
  const removed = [...before.keys()].filter((id) => !after.has(id)).sort();
  const changed = [];

  for (const id of [...before.keys()].filter((key) => after.has(key)).sort()) {
    const changes = [];
    for (const field of FEED_DIFF_FIELDS) {
      const oldValue = feedFieldValue(before.get(id), field);
      const newValue = feedFieldValue(after.get(id), field);
      if (oldValue !== newValue) changes.push({ field, before: oldValue, after: newValue });
    }
    if (changes.length) changed.push({ id, changes });
  }

  return {
    service: "PAL Feed Diff",
    generated_at: nowIso(),
    summary: {
      before_rows: beforeRows.length,
      after_rows: afterRows.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      unchanged: [...before.keys()].filter((id) => after.has(id)).length - changed.length,
    },
    added_ids: added,
    removed_ids: removed,
    changed,
  };
}


function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function x402Finding(findings, severity, code, path, message) {
  findings.push({ severity, code, path, message });
}

function validateX402DeclarationBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  if ("declaration" in body && !isPlainObject(body.declaration)) {
    return { ok: false, error: "declaration must be a JSON object when supplied." };
  }
  if ("payment_required" in body && !isPlainObject(body.payment_required)) {
    return { ok: false, error: "payment_required must be a JSON object when supplied." };
  }
  return { ok: true };
}

function inspectX402Declaration(body) {
  const declaration = isPlainObject(body.declaration)
    ? body.declaration
    : isPlainObject(body.payment_required)
      ? body.payment_required
      : body;
  const findings = [];

  if (declaration.x402Version !== 2) {
    x402Finding(
      findings,
      "error",
      "x402_version",
      "x402Version",
      "x402Version must be the number 2.",
    );
  }

  const resource = declaration.resource;
  if (!isPlainObject(resource)) {
    x402Finding(findings, "error", "resource_missing", "resource", "resource must be an object.");
  } else if (!validHttpUrl(resource.url)) {
    x402Finding(
      findings,
      "error",
      "resource_url",
      "resource.url",
      "resource.url must be an absolute http(s) URL.",
    );
  }

  const accepts = declaration.accepts;
  if (!Array.isArray(accepts) || accepts.length < 1) {
    x402Finding(
      findings,
      "error",
      "accepts_missing",
      "accepts",
      "accepts must be a non-empty array.",
    );
  } else if (accepts.length > 20) {
    x402Finding(
      findings,
      "error",
      "accepts_too_large",
      "accepts",
      "accepts may contain at most 20 entries for this validator.",
    );
  }

  let baseMainnetAccepts = 0;
  let baseUsdcAccepts = 0;
  const seen = new Set();

  if (Array.isArray(accepts)) {
    accepts.slice(0, 20).forEach((accept, index) => {
      const path = "accepts[" + index + "]";
      if (!isPlainObject(accept)) {
        x402Finding(findings, "error", "accept_not_object", path, "accept entry must be an object.");
        return;
      }

      const scheme = String(accept.scheme || "").trim();
      const network = String(accept.network || "").trim();
      const asset = String(accept.asset || "").trim();
      const payTo = String(accept.payTo || "").trim();
      const amount = String(accept.amount ?? "").trim();

      if (!scheme) {
        x402Finding(findings, "error", "scheme_missing", path + ".scheme", "scheme is required.");
      } else if (scheme !== "exact") {
        x402Finding(
          findings,
          "warning",
          "non_exact_scheme",
          path + ".scheme",
          'This validator is optimized for fixed-price "exact" declarations.',
        );
      }

      if (!network) {
        x402Finding(findings, "error", "network_missing", path + ".network", "network is required.");
      }

      if (!/^[1-9]\d*$/.test(amount)) {
        x402Finding(
          findings,
          "error",
          "amount_invalid",
          path + ".amount",
          "amount must be a positive base-10 integer in atomic units.",
        );
      }

      const evm = /^eip155:\d+$/.test(network);
      if (evm) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(asset)) {
          x402Finding(
            findings,
            "error",
            "evm_asset_invalid",
            path + ".asset",
            "EVM asset must be a 20-byte 0x-prefixed token address.",
          );
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(payTo)) {
          x402Finding(
            findings,
            "error",
            "evm_pay_to_invalid",
            path + ".payTo",
            "EVM payTo must be a 20-byte 0x-prefixed address.",
          );
        }
      } else {
        if (!asset) {
          x402Finding(findings, "error", "asset_missing", path + ".asset", "asset is required.");
        }
        if (!payTo) {
          x402Finding(findings, "error", "pay_to_missing", path + ".payTo", "payTo is required.");
        }
      }

      if (!Number.isInteger(accept.maxTimeoutSeconds) || accept.maxTimeoutSeconds <= 0) {
        x402Finding(
          findings,
          "error",
          "timeout_invalid",
          path + ".maxTimeoutSeconds",
          "maxTimeoutSeconds must be a positive integer.",
        );
      }

      if ("extra" in accept && !isPlainObject(accept.extra)) {
        x402Finding(
          findings,
          "warning",
          "extra_shape",
          path + ".extra",
          "extra should be an object when supplied.",
        );
      }

      if (network === X402_NETWORK) {
        baseMainnetAccepts += 1;
        if (asset.toLowerCase() === X402_ASSET.toLowerCase()) {
          baseUsdcAccepts += 1;
        }
      }

      const duplicateKey = [scheme, network, amount, asset.toLowerCase(), payTo.toLowerCase()].join("|");
      if (seen.has(duplicateKey)) {
        x402Finding(
          findings,
          "warning",
          "duplicate_accept",
          path,
          "This payment requirement duplicates an earlier scheme/network/amount/asset/payTo tuple.",
        );
      }
      seen.add(duplicateKey);
    });
  }

  if (Array.isArray(accepts) && accepts.length > 0 && baseMainnetAccepts === 0) {
    x402Finding(
      findings,
      "warning",
      "base_mainnet_missing",
      "accepts",
      "No Base mainnet (eip155:8453) payment requirement is declared.",
    );
  } else if (baseMainnetAccepts > 0 && baseUsdcAccepts === 0) {
    x402Finding(
      findings,
      "warning",
      "base_usdc_missing",
      "accepts",
      "Base mainnet is declared, but no requirement uses the canonical Base USDC asset.",
    );
  }

  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;

  return {
    service: "PAL x402 Declaration Validator",
    generated_at: nowIso(),
    scope:
      "Static x402 v2 declaration validation only. No declared resource is fetched, no payment is made, and liveness or funding is not established.",
    verdict: errors > 0 ? "invalid" : warnings > 0 ? "valid_with_warnings" : "valid",
    summary: {
      valid: errors === 0,
      errors,
      warnings,
      accepts_checked: Array.isArray(accepts) ? Math.min(accepts.length, 20) : 0,
      base_mainnet_accepts: baseMainnetAccepts,
      base_usdc_accepts: baseUsdcAccepts,
    },
    resource_url:
      isPlainObject(resource) && typeof resource.url === "string" ? resource.url : null,
    findings,
  };
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

function catalogRemediationPlan(records) {
  const auditResult = audit(records);
  const rules = {
    ID_MISSING: {
      priority: "critical",
      action: "Assign a stable, unique product id before feed submission; do not reuse IDs across variants.",
    },
    ID_DUPLICATE: {
      priority: "critical",
      action: "Deduplicate product IDs and preserve one stable ID per sellable item or variant.",
    },
    IDENTIFIER_MISSING: {
      priority: "high",
      action: "Supply a valid GTIN when available, otherwise provide brand plus MPN and set identifier_exists consistently.",
    },
    GTIN_FORMAT_INVALID: {
      priority: "high",
      action: "Replace malformed GTIN values with a valid 8, 12, 13, or 14 digit identifier or remove the invalid identifier.",
    },
    GTIN_CHECKSUM_INVALID: {
      priority: "high",
      action: "Correct the GTIN using the manufacturer-issued identifier; do not generate or guess a replacement GTIN.",
    },
    TITLE_MISSING: {
      priority: "high",
      action: "Add a clear product title that identifies the product and differentiates the variant.",
    },
    LINK_INVALID: {
      priority: "high",
      action: "Replace the product link with a public absolute HTTPS product URL.",
    },
    IMAGE_LINK_INVALID: {
      priority: "high",
      action: "Replace the image link with a public absolute HTTPS image URL.",
    },
    PRICE_FORMAT_INVALID: {
      priority: "high",
      action: "Normalize price to a numeric amount followed by an uppercase ISO-4217 currency code, for example 19.99 USD.",
    },
    BRAND_MISSING_FOR_MPN: {
      priority: "medium",
      action: "Add the product brand whenever an MPN is supplied so the identifier pair is complete.",
    },
    AVAILABILITY_UNRECOGNIZED: {
      priority: "medium",
      action: "Normalize availability to in_stock, out_of_stock, preorder, or backorder.",
    },
  };
  const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  const grouped = new Map();

  for (const issue of auditResult.issues) {
    const rule = rules[issue.code] || {
      priority: issue.severity === "error" ? "high" : "medium",
      action: issue.message,
    };
    const current = grouped.get(issue.code) || {
      code: issue.code,
      priority: rule.priority,
      action: rule.action,
      occurrences: 0,
      affected_product_ids: new Set(),
      affected_rows: new Set(),
    };
    current.occurrences += 1;
    if (issue.id) current.affected_product_ids.add(issue.id);
    current.affected_rows.add(issue.index);
    grouped.set(issue.code, current);
  }

  const prioritizedActions = [...grouped.values()]
    .map((item) => ({
      code: item.code,
      priority: item.priority,
      action: item.action,
      occurrences: item.occurrences,
      affected_product_ids: [...item.affected_product_ids].slice(0, 100),
      affected_rows: [...item.affected_rows].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 9) - (priorityRank[b.priority] ?? 9) ||
        b.occurrences - a.occurrences ||
        a.code.localeCompare(b.code),
    );

  const readiness =
    auditResult.error_count > 0
      ? "needs_remediation"
      : auditResult.warning_count > 0
        ? "ready_with_warnings"
        : "ready";

  return {
    service: "PAL Catalog Remediation Plan",
    generated_at: nowIso(),
    readiness,
    summary: {
      records: auditResult.record_count,
      issues: auditResult.issue_count,
      errors: auditResult.error_count,
      warnings: auditResult.warning_count,
      actions: prioritizedActions.length,
      critical_actions: prioritizedActions.filter((item) => item.priority === "critical").length,
      high_actions: prioritizedActions.filter((item) => item.priority === "high").length,
    },
    prioritized_actions: prioritizedActions,
    audit: auditResult,
    disclaimer:
      "Deterministic feed remediation guidance only; not a guarantee of Google Merchant Center approval or regulatory compliance.",
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
    service: "PAL Commerce Catalog Intelligence",
    version: "1.4.0",
    description:
      "Agent-ready ecommerce catalog intelligence for Merchant Center feed auditing, prioritized remediation, GTIN validation, feed change detection, and x402 diagnostics. Pay per call in USDC on Base; Nano remains available as a legacy rail.",
    primary_offer: {
      name: "PAL Batch Catalog Remediation",
      endpoint: "POST /v1/usdc/catalog-remediation-batch",
      price_usd: 5.0,
      records_per_call: 500,
      payment: "x402 v2 exact, USDC on Base",
    },
    paid_endpoint: "POST /v1/audit",
    base_usdc_paid_endpoints: [
      "POST /v1/usdc/catalog-audit",
      "POST /v1/usdc/gtin-check",
      "GET /v1/usdc/gtin-check-one?gtin=...",
      "POST /v1/usdc/feed-diff",
      "POST /v1/usdc/x402-validate",
      "POST /v1/usdc/catalog-remediation",
      "POST /v1/usdc/catalog-remediation-canary",
      "POST /v1/usdc/catalog-remediation-batch",
    ],
    agentpay_endpoint: "POST /v1/agentpay",
    free_endpoints: ["GET /health", "GET /v1/price", "GET /v1/stats"],
    limits: { records_per_audit: 100, records_per_batch_remediation: 500, request_body: "1mb" },
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
    discovery: {
      x402: `${PUBLIC_BASE_URL}/.well-known/x402`,
      agent: `${PUBLIC_BASE_URL}/.well-known/agent.json`,
      openapi: `${PUBLIC_BASE_URL}/openapi.json`,
      marketplace_openapi: `${PUBLIC_BASE_URL}/marketplace-openapi.json`,
      llms: `${PUBLIC_BASE_URL}/llms.txt`,
      skill: `${PUBLIC_BASE_URL}/skill.md`,
    },
    categories: [
      "ecommerce",
      "commerce",
      "google-shopping",
      "merchant-center",
      "product-feed",
      "catalog-remediation",
      "gtin",
      "developer-tools",
      "x402",
    ],
    source: "https://github.com/enricoaboujaoude-droid/practical-automation-lab/tree/nano-seller/nano-seller",
  });
});

app.get("/favicon.svg", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#111827"/><path d="M17 45V19h8v10l13-10h10L33 31l16 14H38L25 33v12z" fill="#fff"/></svg>`);
});

app.get("/a308e807eac54897f390bd401091a89b.txt", (_req, res) => {
  res.set("Cache-Control", "public, max-age=86400");
  res.type("text/plain").send("a308e807eac54897f390bd401091a89b");
});

app.get("/robots.txt", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${PUBLIC_BASE_URL}/sitemap.xml
`);
});

app.get("/sitemap.xml", (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600");
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${PUBLIC_BASE_URL}/marketplace</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${PUBLIC_BASE_URL}/llms.txt</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${PUBLIC_BASE_URL}/skill.md</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${PUBLIC_BASE_URL}/openapi.json</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${PUBLIC_BASE_URL}/marketplace-openapi.json</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${PUBLIC_BASE_URL}/.well-known/x402</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
</urlset>`);
});

app.get("/marketplace", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Google Merchant Center Product Feed Audit API | PAL Commerce Catalog Intelligence</title>
  <meta name="description" content="Pay-per-call ecommerce catalog intelligence for Google Merchant Center feed audits, prioritized remediation, GTIN/UPC/EAN validation, feed diffs, and x402 diagnostics.">
  <link rel="canonical" href="${PUBLIC_BASE_URL}/marketplace">
  <link rel="icon" href="${PUBLIC_BASE_URL}/favicon.svg" type="image/svg+xml">
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:0 auto;padding:48px 24px;color:#111827;line-height:1.6}
    h1{font-size:2.4rem;line-height:1.15;margin-bottom:.6rem}
    h2{margin-top:2rem}.lead{font-size:1.15rem;color:#374151}
    .card{border:1px solid #e5e7eb;border-radius:14px;padding:18px;margin:14px 0}
    code{background:#f3f4f6;padding:.15rem .35rem;border-radius:6px}
    a{color:#0f62fe}.price{font-weight:700}.muted{color:#6b7280}
  </style>
  <script type="application/ld+json">
  ${JSON.stringify({
    "@context":"https://schema.org",
    "@type":"SoftwareApplication",
    name:"PAL Commerce Catalog Intelligence API",
    applicationCategory:"DeveloperApplication",
    operatingSystem:"Web API",
    description:"Pay-per-call ecommerce catalog intelligence for Merchant Center feed audits, catalog remediation, GTIN validation, feed comparison, and x402 diagnostics.",
    offers:{
      "@type":"AggregateOffer",
      lowPrice:"0.01",
      highPrice:"5.00",
      priceCurrency:"USD"
    },
    url:`${PUBLIC_BASE_URL}/marketplace`
  })}
  </script>
</head>
<body>
  <h1>PAL Commerce Catalog Intelligence API</h1>
  <p class="lead">Deterministic, agent-ready ecommerce catalog intelligence for Google Merchant Center, shopping feeds, marketplaces, and automated commerce workflows.</p>
  <p><a href="/v1/sample/catalog-remediation"><strong>See a free remediation result →</strong></a> &nbsp; <a href="/v1/sample/catalog-audit">See audit sample</a> &nbsp; <a href="/v1/sample/gtin-check">See GTIN sample</a></p>

  <div class="card">
    <h2>Use it from an AI agent</h2>
    <p>PAL is published in the <a href="https://registry.modelcontextprotocol.io/?q=io.github.enricoaboujaoude-droid%2Fpal-commerce-catalog-intelligence" rel="noopener noreferrer">Official MCP Registry</a> and exposes a production Streamable HTTP server.</p>
    <p><strong>Remote MCP:</strong> <code>${PUBLIC_BASE_URL}/mcp</code></p>
    <p>The MCP server exposes three free discovery/demo tools and seven x402-paid commerce tools. Paid MCP calls return the live Base-USDC payment requirement before any paid result is delivered.</p>
  </div>

  <div class="card">
    <h2>Batch Catalog Remediation <span class="price">$5.00 / call</span></h2>
    <p>Process up to 500 product records in one paid call and receive a prioritized Merchant Center/product-feed remediation plan with concrete corrective actions.</p>
    <code>POST /v1/usdc/catalog-remediation-batch</code>
  </div>

  <div class="card">
    <h2>Catalog Remediation Plan <span class="price">$1.00 / call</span></h2>
    <p>Turn 1-100 product records into a prioritized Merchant Center and product-feed remediation plan with concrete corrective actions and affected product IDs.</p>
    <code>POST /v1/usdc/catalog-remediation</code>
  </div>

  <div class="card">
    <h2>Catalog Feed Audit <span class="price">$0.01 / call</span></h2>
    <p>Check duplicate IDs, GTIN format and checksum, URL shape, price formatting, availability, and brand/MPN consistency.</p>
    <code>POST /v1/usdc/catalog-audit</code>
  </div>

  <div class="card">
    <h2>GTIN / UPC / EAN Validation <span class="price">$0.01 / call</span></h2>
    <p>Validate one or up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, and GTIN-14 identifiers including check digits.</p>
    <code>POST /v1/usdc/gtin-check</code>
  </div>

  <div class="card">
    <h2>Product Feed Diff <span class="price">$0.01 / call</span></h2>
    <p>Compare two feed snapshots and return added, removed, and changed commerce fields.</p>
    <code>POST /v1/usdc/feed-diff</code>
  </div>

  <div class="card">
    <h2>x402 Declaration Validator <span class="price">$0.05 / call</span></h2>
    <p>Statically validate x402 v2 payment declarations for Base/USDC readiness without paying the referenced resource.</p>
    <code>POST /v1/usdc/x402-validate</code>
  </div>

  <div class="card">
    <h2>API providers: add an agent-native sales channel</h2>
    <p>If you already operate an API or MCP service, AgenticTrade provides AI-agent discovery and automatic usage billing.</p>
    <p><a href="https://agentictrade.io/portal/register?ref=6HDHVHZ3" rel="sponsored noopener noreferrer"><strong>List a service on AgenticTrade →</strong></a></p>
    <p class="muted">Affiliate disclosure: Practical Automation Lab participates in AgenticTrade's referral program and may earn referral revenue from qualifying providers who join through this link.</p>
  </div>

  <h2>Machine-readable discovery</h2>
  <p>
    <a href="/.well-known/x402">x402 manifest</a> ·
    <a href="/.well-known/agent.json">agent card</a> ·
    <a href="/openapi.json">x402 OpenAPI</a> ·
    <a href="/marketplace-openapi.json">marketplace OpenAPI</a> ·
    <a href="/llms.txt">llms.txt</a> ·
    <a href="/skill.md">agent skill</a> ·
    <a href="https://registry.modelcontextprotocol.io/?q=io.github.enricoaboujaoude-droid%2Fpal-commerce-catalog-intelligence" rel="noopener noreferrer">Official MCP Registry</a>
  </p>
  <p class="muted">Payment: x402 v2 exact · USDC on Base mainnet · no account or API key required for direct paid calls.</p>
</body>
</html>`);
});

app.get("/llms.txt", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/plain").send(`# Practical Automation Lab — paid commerce-data tools

Base URL: ${PUBLIC_BASE_URL}
Payment: x402 v2 exact on Base mainnet (eip155:8453), USDC
Seller wallet: ${BASE_PAYOUT_ADDRESS}
OpenAPI: ${PUBLIC_BASE_URL}/openapi.json
x402 manifest: ${PUBLIC_BASE_URL}/.well-known/x402

## Paid tools

### PAL Catalog Feed Identifier Audit
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-audit
Price: $0.01 USDC per successful call
Input: {"records":[...]} with 1-100 product records.
Use for deterministic checks of duplicate IDs, GTIN format/checksum, URL shape, price formatting, availability, brand/MPN consistency.

### PAL Single GTIN Check
GET ${PUBLIC_BASE_URL}/v1/usdc/gtin-check-one?gtin=4006381333931
Price: $0.01 USDC per successful call
Input: one GTIN/UPC/EAN identifier in the gtin query parameter.
Returns normalized identifier, length, expected/actual check digit and validity.

### PAL GTIN Check
POST ${PUBLIC_BASE_URL}/v1/usdc/gtin-check
Price: $0.01 USDC per successful call
Input: {"gtins":[...]} with 1-100 GTIN/UPC/EAN values.
Returns normalized identifier, supported length, expected/actual check digit and validity.

### PAL Feed Diff
POST ${PUBLIC_BASE_URL}/v1/usdc/feed-diff
Price: $0.01 USDC per successful call
Input: {"before":[...],"after":[...]} with up to 100 rows per snapshot.
Returns added IDs, removed IDs and structured field-level changes.

### PAL x402 Declaration Validator
POST ${PUBLIC_BASE_URL}/v1/usdc/x402-validate
Price: $0.05 USDC per successful call
Input: an x402 v2 PaymentRequired object directly, or wrap it as {"declaration":{...}} or {"payment_required":{...}}.
Returns deterministic protocol-shape findings, Base/EVM readiness, amount/address/asset checks, duplicate accepts, and warnings. It never fetches or pays the declared resource.

### PAL Batch Catalog Remediation
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-remediation-batch
Price: $5.00 USDC per successful call
Input: {"records":[...]} with 1-500 product records.
Use for larger catalogs when a buyer wants one prioritized Merchant Center/product-feed remediation plan in a single paid call.

### PAL Catalog Remediation Plan
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-remediation
Price: $1.00 USDC per successful call
Input: {"records":[...]} with 1-100 product records.
Returns the base audit plus a prioritized Merchant Center/product-feed remediation plan, grouped by issue code and business impact, with concrete corrective actions and affected product IDs.

## Buyer flow
1. POST valid JSON without payment.
2. Read HTTP 402 and PAYMENT-REQUIRED.
3. Satisfy one exact Base-USDC requirement.
4. Retry the identical request with PAYMENT-SIGNATURE.
5. Read the JSON result and PAYMENT-RESPONSE.

These are deterministic commerce-data utilities. They do not modify stores, require merchant credentials, or use an LLM.
`);
});

app.get("/skill.md", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("text/markdown").send(`# PAL Commerce Data Tools

Use these tools when an agent needs cheap deterministic validation of ecommerce catalog data.

## audit_catalog_feed
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-audit
Cost: $0.01 USDC
Body: {"records":[product,...]}
Use before Google Merchant Center / shopping-feed submission or when checking identifier, price, URL, availability and variant-readiness issues.

## validate_single_gtin
GET ${PUBLIC_BASE_URL}/v1/usdc/gtin-check-one?gtin=4006381333931
Cost: $0.01 USDC
Use for a single GTIN/UPC/EAN lookup with no JSON body.

## validate_gtins
POST ${PUBLIC_BASE_URL}/v1/usdc/gtin-check
Cost: $0.01 USDC
Body: {"gtins":["4006381333931",...]}
Use to validate GTIN-8, GTIN-12/UPC, GTIN-13/EAN and GTIN-14 lengths and check digits.

## diff_product_feeds
POST ${PUBLIC_BASE_URL}/v1/usdc/feed-diff
Cost: $0.01 USDC
Body: {"before":[...],"after":[...]}
Use to detect product additions/removals and changes to title, link, image, price, availability, brand, GTIN and MPN.

## validate_x402_declaration
POST ${PUBLIC_BASE_URL}/v1/usdc/x402-validate
Cost: $0.05 USDC
Body: an x402 v2 PaymentRequired object or a wrapper containing declaration/payment_required.
Use to statically validate protocol shape, payment requirements, Base/EVM fields, amounts, timeouts and duplicate accepts without paying or fetching the declared resource.

## remediate_catalog_feed_batch
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-remediation-batch
Cost: $5.00 USDC
Body: {"records":[product,...]} with 1-500 records.
Use for larger Merchant Center/product-feed remediation jobs that should complete in one payment and one call.

## remediate_catalog_feed
POST ${PUBLIC_BASE_URL}/v1/usdc/catalog-remediation
Cost: $1.00 USDC
Body: {"records":[product,...]} with 1-100 records.
Use when an agent needs a prioritized, machine-readable remediation plan rather than only raw validation findings.

Payment protocol: x402 v2 exact, Base mainnet USDC.
Discovery: ${PUBLIC_BASE_URL}/.well-known/x402
OpenAPI: ${PUBLIC_BASE_URL}/openapi.json
`);
});

app.get("/.well-known/agent.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.type("application/json").json({
    version: "1.4",
    origin: new URL(PUBLIC_BASE_URL).host,
    display_name: "PAL Commerce Catalog Intelligence",
    description:
      "Seven deterministic pay-per-call commerce tools for autonomous agents: Merchant Center feed audit, batch and standard catalog remediation, GTIN validation, feed diff, and x402 diagnostics.",
    payout_address: BASE_PAYOUT_ADDRESS,
    payments: {
      x402: {
        networks: [
          {
            network: "base",
            asset: "USDC",
            contract: X402_ASSET,
          },
        ],
      },
    },
    intents: [
      {
        name: "catalog_audit",
        description:
          "Audit 1-100 Google Merchant Center and product-feed records for duplicate IDs, GTIN validity, URLs, prices, availability, and brand/MPN consistency.",
        endpoint: X402_AUDIT_PATH,
        method: "POST",
        price: { amount: 0.01, currency: "USDC" },
      },
      {
        name: "catalog_remediation_batch",
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan for up to 500 catalog records in one paid call.",
        endpoint: X402_REMEDIATE_BATCH_PATH,
        method: "POST",
        price: { amount: 5.0, currency: "USDC" },
      },
      {
        name: "catalog_remediation",
        description:
          "Generate a prioritized Merchant Center and product-feed remediation plan for 1-100 catalog records with concrete corrective actions and affected product IDs.",
        endpoint: X402_REMEDIATE_PATH,
        method: "POST",
        price: { amount: 1.0, currency: "USDC" },
      },
      {
        name: "single_gtin_check",
        description:
          "Validate one GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifier including its check digit.",
        endpoint: X402_GTIN_ONE_PATH,
        method: "GET",
        price: { amount: 0.01, currency: "USDC" },
      },
      {
        name: "gtin_check",
        description:
          "Validate up to 100 GTIN-8, UPC/GTIN-12, GTIN-13, or GTIN-14 identifiers including check digits.",
        endpoint: X402_GTIN_PATH,
        method: "POST",
        price: { amount: 0.01, currency: "USDC" },
      },
      {
        name: "feed_diff",
        description:
          "Compare two product-feed snapshots and report added, removed, and changed commerce fields.",
        endpoint: X402_FEED_DIFF_PATH,
        method: "POST",
        price: { amount: 0.01, currency: "USDC" },
      },
      {
        name: "x402_validate",
        description:
          "Statically validate x402 v2 payment declarations for protocol shape, Base/USDC fields, amounts, recipient, timeout, and duplicate accepts.",
        endpoint: X402_VALIDATE_PATH,
        method: "POST",
        price: { amount: 0.05, currency: "USDC" },
      },
    ],
    service_version: "1.4.0",
    homepage: PUBLIC_BASE_URL,
    docs: `${PUBLIC_BASE_URL}/llms.txt`,
    skill: `${PUBLIC_BASE_URL}/skill.md`,
    openapi: `${PUBLIC_BASE_URL}/openapi.json`,
    x402: `${PUBLIC_BASE_URL}/.well-known/x402`,
    payment: {
      protocol: "x402",
      version: 2,
      scheme: "exact",
      network: X402_NETWORK,
      asset: "USDC",
      asset_address: X402_ASSET,
      pay_to: BASE_PAYOUT_ADDRESS,
    },
    tools: [
      {
        name: "audit_catalog_feed",
        method: "POST",
        url: X402_AUDIT_URL,
        price_usd: 0.01,
      },
      {
        name: "remediate_catalog_feed",
        method: "POST",
        url: X402_REMEDIATE_URL,
        price_usd: 1.0,
      },
      {
        name: "remediate_catalog_feed_batch",
        method: "POST",
        url: X402_REMEDIATE_BATCH_URL,
        price_usd: 5.0,
      },
      {
        name: "validate_single_gtin",
        method: "GET",
        url: X402_GTIN_ONE_URL,
        price_usd: 0.01,
      },
      {
        name: "validate_gtins",
        method: "POST",
        url: X402_GTIN_URL,
        price_usd: 0.01,
      },
      {
        name: "diff_product_feeds",
        method: "POST",
        url: X402_FEED_DIFF_URL,
        price_usd: 0.01,
      },
      {
        name: "validate_x402_declaration",
        method: "POST",
        url: X402_VALIDATE_URL,
        price_usd: 0.05,
      },
    ],
  });
});

app.get("/discovery/resources", (req, res) => {
  const manifestResources = x402Manifest().resources;
  const payTo = typeof req.query.payTo === "string" ? req.query.payTo.toLowerCase() : null;
  const scheme = typeof req.query.scheme === "string" ? req.query.scheme : null;
  const network = typeof req.query.network === "string" ? req.query.network : null;
  const requestedLimit = Number.parseInt(String(req.query.limit || "20"), 10);
  const requestedOffset = Number.parseInt(String(req.query.offset || "0"), 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 20;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;

  const items = manifestResources
    .map((entry) => ({
      resource: entry.resource,
      type: "http",
      x402Version: 2,
      accepts: entry.accepts,
      lastUpdated: new Date().toISOString(),
    }))
    .filter((entry) => {
      if (payTo && !entry.accepts.some((accept) => String(accept.payTo || "").toLowerCase() === payTo)) {
        return false;
      }
      if (scheme && !entry.accepts.some((accept) => accept.scheme === scheme)) {
        return false;
      }
      if (network && !entry.accepts.some((accept) => accept.network === network)) {
        return false;
      }
      return true;
    });

  res.set("Cache-Control", "public, max-age=300");
  res.json({
    x402Version: 2,
    items: items.slice(offset, offset + limit),
    pagination: {
      limit,
      offset,
      total: items.length,
    },
  });
});

app.get("/.well-known/x402", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(x402Manifest());
});

app.get("/.well-known/x402-service.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json(true402Manifest());
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

app.get("/.well-known/402index-verify.txt", (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!index402VerificationHash) {
    return res.status(404).type("text/plain").send("verification_not_ready");
  }
  return res.type("text/plain").send(index402VerificationHash);
});

app.get("/v1/402index/claim-status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    marketplace: "402 Index",
    domain: INDEX402_DOMAIN,
    service_id: INDEX402_SERVICE_ID,
    ...index402ClaimState,
  });
});

app.get("/v1/402index/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "402 Index",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://402index.io",
    ...index402State,
  });
});

app.get("/v1/x402scout/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "x402Scout",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://x402scout.com",
    ...x402ScoutState,
  });
});

app.get("/.well-known/agent-tools-verify.txt", (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!agentToolsVerificationToken) {
    return res.status(404).type("text/plain").send("verification_not_ready");
  }
  return res.type("text/plain").send(agentToolsVerificationToken);
});

app.get("/v1/agenttools/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "agent-tools.cloud",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://agent-tools.cloud",
    ...agentToolsState,
  });
});

app.get("/v1/opendexter/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "x402gle / OpenDexter",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    ...openDexterAuditionState,
  });
});

app.get("/v1/true402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "true402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://true402.dev/catalog",
    ...true402State,
  });
});

app.get("/v1/market402/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    service: "PAL Catalog Feed Identifier Audit",
    marketplace: "Market402",
    route: X402_AUDIT_PATH,
    price_usd: 0.01,
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    directory: "https://market402.com",
    ...market402State,
  });
});

app.get("/v1/nohumans/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    marketplace: "nohumans.directory",
    directory: "https://nohumans.directory",
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    ...noHumansState,
  });
});

app.get("/v1/x402dash/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    marketplace: "x402dash",
    directory: "https://x402dash.com",
    payout_network: X402_NETWORK,
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    ...x402DashState,
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
    usdc_x402_paid_audits_since_process_start: usdcPaidAudits,
    usdc_x402_paid_gtin_checks_since_process_start: usdcPaidGtinChecks,
    usdc_x402_paid_single_gtin_checks_since_process_start: usdcPaidSingleGtinChecks,
    usdc_x402_paid_feed_diffs_since_process_start: usdcPaidFeedDiffs,
    usdc_x402_paid_x402_validations_since_process_start: usdcPaidX402Validations,
    usdc_x402_paid_catalog_remediations_since_process_start: usdcPaidCatalogRemediations,
    usdc_x402_paid_catalog_remediation_batches_since_process_start: usdcPaidCatalogRemediationBatches,
    usdc_x402_revenue_if_all_current_process_calls_settled_usd: Number((
      usdcPaidAudits * 0.01 +
      usdcPaidGtinChecks * 0.01 +
      usdcPaidSingleGtinChecks * 0.01 +
      usdcPaidFeedDiffs * 0.01 +
      usdcPaidX402Validations * 0.05 +
      usdcPaidCatalogRemediations * 1.00 +
      usdcPaidCatalogRemediationBatches * 5.00
    ).toFixed(2)),
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

app.get("/v1/agentpay", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    ok: true,
    ready: true,
    service: "PAL Catalog Feed Auditor",
    marketplace: "AgenticTrade",
    method: "POST",
    billing: "handled_upstream",
    price_per_call_usdc: "0.1",
    category: "data",
    capabilities: [
      "catalog-audit",
      "product-feed-validation",
      "gtin-validation",
      "duplicate-id-detection",
      "merchant-center-readiness"
    ],
    limits: { records_per_audit: 100 },
    input: {
      messages: [
        {
          role: "user",
          content:
            "{\"records\":[{\"id\":\"sku-100\",\"title\":\"Example Product\",\"gtin\":\"4006381333931\",\"brand\":\"Example\",\"mpn\":\"SKU-100\",\"price\":\"19.99 USD\",\"availability\":\"in_stock\",\"identifier_exists\":true}]}"
        }
      ]
    }
  });
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
      provider: "AgenticTrade",
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

  usdcPaidAudits += 1;
  console.log(
    `[revenue] usdc_x402_catalog_audit served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidAudits}`
  );

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

app.get("/v1/sample/gtin-check", (req, res) => {
  const gtin = String(req.query?.gtin || "4006381333931").trim();
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL Single GTIN Check",
    sample: true,
    result: inspectGtin(gtin),
    paid_endpoint: `${X402_GTIN_ONE_URL}?gtin=${encodeURIComponent(gtin)}`,
    paid_price_usd: USDC_X402_PRICE,
  });
});

app.get("/v1/sample/catalog-audit", (_req, res) => {
  const input = catalogAuditExample();
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL Catalog Feed Audit",
    sample: true,
    input,
    result: audit(input.records),
    paid_endpoint: X402_AUDIT_URL,
    paid_price_usd: USDC_X402_PRICE,
  });
});

app.get("/v1/sample/gtin-batch", (_req, res) => {
  const gtins = ["4006381333931", "036000291452"];
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL GTIN Check",
    sample: true,
    input: { gtins },
    result: gtinCheck(gtins),
    paid_endpoint: X402_GTIN_URL,
    paid_price_usd: USDC_X402_PRICE,
  });
});

app.get("/v1/sample/feed-diff", (_req, res) => {
  const before = [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }];
  const after = [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }];
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL Feed Diff",
    sample: true,
    input: { before, after },
    result: feedDiff(before, after),
    paid_endpoint: X402_FEED_DIFF_URL,
    paid_price_usd: USDC_X402_PRICE,
  });
});

app.get("/v1/sample/x402-validate", (_req, res) => {
  const declaration = {
    x402Version: 2,
    resource: { url: X402_AUDIT_URL },
    accepts: [{
      scheme: "exact",
      network: USDC_X402_NETWORK,
      amount: X402_PRICE_ATOMIC,
      asset: X402_ASSET,
      payTo: BASE_PAYOUT_ADDRESS,
      maxTimeoutSeconds: 300,
      extra: { name: "USD Coin", version: "2" },
    }],
  };
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL x402 Declaration Validator",
    sample: true,
    input: declaration,
    result: inspectX402Declaration(declaration),
    paid_endpoint: X402_VALIDATE_URL,
    paid_price_usd: X402_VALIDATE_PRICE_USD,
  });
});

app.get("/v1/sample/catalog-remediation", (_req, res) => {
  const input = {
    records: [
      {
        id: "sku-demo",
        title: "",
        link: "http://example.com/products/sku-demo",
        image_link: "not-a-url",
        gtin: "4006381333932",
        brand: "",
        mpn: "SKU-DEMO",
        price: "19.99",
        availability: "available",
        identifier_exists: true,
      },
      {
        id: "sku-demo",
        title: "Second demo variant",
        link: "https://example.com/products/sku-demo-2",
        image_link: "https://example.com/images/sku-demo-2.jpg",
        gtin: "",
        brand: "",
        mpn: "",
        price: "22.00 USD",
        availability: "in_stock",
        identifier_exists: true,
      },
    ],
  };
  res.set("Cache-Control", "public, max-age=300");
  return res.json({
    service: "PAL Catalog Remediation Plan",
    sample: true,
    demo_note:
      "This intentionally flawed sample shows the prioritized actions returned for common feed problems.",
    input,
    result: catalogRemediationPlan(input.records),
    paid_endpoint: X402_REMEDIATE_URL,
    paid_price_usd: X402_REMEDIATE_PRICE_USD,
  });
});

app.get("/v1/usdc/gtin-check-one", (req, res) => {
  const gtin = String(req.query?.gtin || "").trim();
  if (!gtin) {
    return res.status(400).json({
      error: "invalid_gtin",
      detail: "Query parameter gtin is required.",
      example: { gtin: "4006381333931" },
    });
  }

  usdcPaidSingleGtinChecks += 1;
  console.log(
    `[revenue] usdc_x402_single_gtin_check served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidSingleGtinChecks}`
  );

  return res.json({
    service: "PAL Single GTIN Check",
    generated_at: nowIso(),
    result: inspectGtin(gtin),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/gtin-check", (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  usdcPaidGtinChecks += 1;
  console.log(
    `[revenue] usdc_x402_gtin_check served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidGtinChecks}`
  );

  return res.json({
    ...gtinCheck(gtins),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/feed-diff", (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  usdcPaidFeedDiffs += 1;
  console.log(
    `[revenue] usdc_x402_feed_diff served price_usd=0.01 network=${USDC_X402_NETWORK} count=${usdcPaidFeedDiffs}`
  );

  return res.json({
    ...feedDiff(req.body.before, req.body.after),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: USDC_X402_PRICE,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/catalog-remediation-canary", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length !== 1) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with exactly 1 product record.",
    });
  }

  console.log(
    `[revenue] usdc_x402_catalog_remediation_canary served price_usd=0.10 network=${USDC_X402_NETWORK}`
  );

  return res.json({
    ...catalogRemediationPlan(records),
    offer: {
      product: "PAL Batch Catalog Remediation",
      canary: true,
      premium_endpoint: X402_REMEDIATE_BATCH_URL,
      premium_price_usd: X402_REMEDIATE_BATCH_PRICE_USD,
      premium_max_records: 500,
    },
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: X402_REMEDIATE_CANARY_PRICE_USD,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/catalog-remediation-batch", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 500) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 500 items.",
    });
  }

  usdcPaidCatalogRemediationBatches += 1;
  console.log(
    `[revenue] usdc_x402_catalog_remediation_batch served price_usd=5.00 network=${USDC_X402_NETWORK} count=${usdcPaidCatalogRemediationBatches}`
  );

  return res.json({
    ...catalogRemediationPlan(records),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: X402_REMEDIATE_BATCH_PRICE_USD,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/catalog-remediation", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
    });
  }

  usdcPaidCatalogRemediations += 1;
  console.log(
    `[revenue] usdc_x402_catalog_remediation served price_usd=1.00 network=${USDC_X402_NETWORK} count=${usdcPaidCatalogRemediations}`
  );

  return res.json({
    ...catalogRemediationPlan(records),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: X402_REMEDIATE_PRICE_USD,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

app.post("/v1/usdc/x402-validate", (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: "invalid_declaration", detail: validation.error });
  }

  usdcPaidX402Validations += 1;
  console.log(
    "[revenue] usdc_x402_declaration_validation served price_usd=0.05 network=" +
      USDC_X402_NETWORK +
      " count=" +
      usdcPaidX402Validations,
  );

  return res.json({
    ...inspectX402Declaration(req.body),
    payment: {
      verified_by: "x402",
      network: USDC_X402_NETWORK,
      asset: "USDC",
      price_usd: X402_VALIDATE_PRICE_USD,
      pay_to: BASE_PAYOUT_ADDRESS,
      facilitator: "PayAI",
    },
  });
});

const MARKETPLACE_UPSTREAM_TOKEN = String(
  process.env.MARKETPLACE_UPSTREAM_TOKEN || "",
).trim();

function requireMarketplaceGateway(req, res, next) {
  if (!MARKETPLACE_UPSTREAM_TOKEN) {
    return res.status(503).json({
      error: "marketplace_gateway_not_configured",
      detail:
        "Direct marketplace-upstream access is disabled until a billing marketplace injects the private gateway token.",
      direct_paid_api: `${PUBLIC_BASE_URL}/openapi.json`,
      mcp: `${PUBLIC_BASE_URL}/mcp`,
    });
  }

  const supplied = String(req.get("x-pal-marketplace-token") || "");
  const expected = Buffer.from(MARKETPLACE_UPSTREAM_TOKEN);
  const actual = Buffer.from(supplied);

  if (
    expected.length !== actual.length ||
    !crypto.timingSafeEqual(expected, actual)
  ) {
    return res.status(401).json({
      error: "marketplace_gateway_auth_required",
      detail:
        "This upstream route is reserved for configured billing marketplaces. Use the direct x402 API or official MCP server instead.",
      direct_paid_api: `${PUBLIC_BASE_URL}/openapi.json`,
      mcp: `${PUBLIC_BASE_URL}/mcp`,
    });
  }

  return next();
}

app.post("/v1/upstream/catalog-audit", requireMarketplaceGateway, (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
      example: catalogAuditExample(),
    });
  }

  const result = audit(records);
  console.log(
    `[revenue] marketplace_upstream catalog-audit served records=${records.length}`
  );

  return res.json({
    ...result,
    provider_upstream: {
      service: "PAL Catalog Feed Identifier Audit",
      billing: "handled_by_marketplace",
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/upstream/catalog-remediation", requireMarketplaceGateway, (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
      example: catalogAuditExample(),
    });
  }

  console.log(
    `[revenue] marketplace_upstream catalog-remediation served records=${records.length}`
  );

  return res.json({
    ...catalogRemediationPlan(records),
    provider_upstream: {
      service: "PAL Catalog Remediation Plan",
      billing: "handled_by_marketplace",
    },
    generated_at: nowIso(),
    disclaimer:
      "Deterministic catalog remediation guidance; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/upstream/gtin-check", requireMarketplaceGateway, (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  console.log(
    `[revenue] marketplace_upstream gtin-check served count=${gtins.length}`
  );

  return res.json({
    ...gtinCheck(gtins),
    provider_upstream: {
      service: "PAL GTIN Check",
      billing: "handled_by_marketplace",
    },
  });
});

app.post("/v1/upstream/feed-diff", requireMarketplaceGateway, (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  console.log(
    `[revenue] marketplace_upstream feed-diff served before=${req.body.before.length} after=${req.body.after.length}`
  );

  return res.json({
    ...feedDiff(req.body.before, req.body.after),
    provider_upstream: {
      service: "PAL Feed Diff",
      billing: "handled_by_marketplace",
    },
  });
});

app.post("/v1/upstream/x402-validate", requireMarketplaceGateway, (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: "invalid_declaration", detail: validation.error });
  }

  console.log("[revenue] marketplace_upstream x402-validate served");

  return res.json({
    ...inspectX402Declaration(req.body),
    provider_upstream: {
      service: "PAL x402 Declaration Validator",
      billing: "handled_by_marketplace",
    },
  });
});


app.get("/marketplace-openapi.json", (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({
    openapi: "3.0.3",
    info: {
      title: "PAL Commerce Catalog Intelligence API",
      version: "1.1.0",
      description:
        "Marketplace-ready ecommerce catalog intelligence for Merchant Center feed audits, remediation, GTIN validation, feed change detection, and x402 declaration validation.",
    },
    servers: [{ url: PUBLIC_BASE_URL }],
    paths: {
      "/v1/upstream/catalog-audit": {
        post: {
          operationId: "auditCatalogFeed",
          summary: "Audit ecommerce product-feed records",
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
            200: { description: "Structured catalog audit result" },
            400: { description: "Invalid request payload" },
          },
        },
      },
      "/v1/upstream/catalog-remediation": {
        post: {
          operationId: "remediateCatalogFeed",
          summary: "Generate a prioritized Merchant Center remediation plan",
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
            200: { description: "Prioritized remediation plan with concrete corrective actions" },
            400: { description: "Invalid request payload" },
          },
        },
      },
      "/v1/upstream/gtin-check": {
        post: {
          operationId: "validateGtins",
          summary: "Validate GTIN, UPC, and EAN identifiers",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["gtins"],
                  properties: {
                    gtins: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: { oneOf: [{ type: "string" }, { type: "number" }] },
                    },
                  },
                },
                example: { gtins: ["4006381333931", "036000291452"] },
              },
            },
          },
          responses: {
            200: { description: "GTIN validation result" },
            400: { description: "Invalid request payload" },
          },
        },
      },
      "/v1/upstream/feed-diff": {
        post: {
          operationId: "diffProductFeeds",
          summary: "Compare two product-feed snapshots",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["before", "after"],
                  properties: {
                    before: {
                      type: "array",
                      maxItems: 100,
                      items: { type: "object", additionalProperties: true },
                    },
                    after: {
                      type: "array",
                      maxItems: 100,
                      items: { type: "object", additionalProperties: true },
                    },
                  },
                },
                example: {
                  before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
                  after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
                },
              },
            },
          },
          responses: {
            200: { description: "Feed change result" },
            400: { description: "Invalid request payload" },
          },
        },
      },
      "/v1/upstream/x402-validate": {
        post: {
          operationId: "validateX402Declaration",
          summary: "Validate an x402 v2 payment declaration",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true },
              },
            },
          },
          responses: {
            200: { description: "x402 declaration validation result" },
            400: { description: "Invalid request payload" },
          },
        },
      },
    },
  });
});


function minia2aJsonParam(req, name, fallback = null) {
  if (req.method === "POST") {
    const value = req.body?.[name];
    return value === undefined ? fallback : value;
  }
  const raw = req.query?.[name];
  if (raw === undefined) return fallback;
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return String(raw);
  }
}

function minia2aCatalogPayload(req) {
  const records = minia2aJsonParam(req, "records", null);
  if (Array.isArray(records)) return records;
  const input = minia2aJsonParam(req, "input", null);
  return input && typeof input === "object" && Array.isArray(input.records)
    ? input.records
    : null;
}

function minia2aGtins(req) {
  const direct = minia2aJsonParam(req, "gtins", null);
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string") {
    return direct.split(",").map((value) => value.trim()).filter(Boolean);
  }
  const input = minia2aJsonParam(req, "input", null);
  if (input && typeof input === "object" && Array.isArray(input.gtins)) return input.gtins;
  const gtin = String(req.query?.gtin || "").trim();
  return gtin ? [gtin] : null;
}

function minia2aFeedPayload(req) {
  if (req.method === "POST") {
    return { before: req.body?.before, after: req.body?.after };
  }
  const input = minia2aJsonParam(req, "input", null);
  if (input && typeof input === "object") {
    return { before: input.before, after: input.after };
  }
  return {
    before: minia2aJsonParam(req, "before", null),
    after: minia2aJsonParam(req, "after", null),
  };
}

function minia2aDeclarationPayload(req) {
  if (req.method === "POST") return req.body;
  const input = minia2aJsonParam(req, "input", null);
  if (input && typeof input === "object") return input;
  const declaration = minia2aJsonParam(req, "declaration", null);
  if (declaration && typeof declaration === "object") return { declaration };
  return null;
}

function miniCatalogAudit(req, res) {
  const records = minia2aCatalogPayload(req);
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      ok: false,
      error: "invalid_records",
      detail:
        "Provide 1-100 records as POST JSON {records:[...]} or GET ?records=<urlencoded JSON array>.",
      example: catalogAuditExample(),
    });
  }

  const result = audit(records);
  console.log(`[revenue] minia2a_catalog_audit upstream served records=${records.length}`);
  return res.json({
    ok: true,
    result,
    provider: "Practical Automation Lab",
    billing: "handled_by_minia2a",
  });
}

function miniGtinCheck(req, res) {
  const gtins = minia2aGtins(req);
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      ok: false,
      error: "invalid_gtins",
      detail:
        "Provide 1-100 GTINs as POST JSON {gtins:[...]} or GET ?gtins=<comma-separated values>.",
      example: { gtins: ["4006381333931", "036000291452"] },
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        ok: false,
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  console.log(`[revenue] minia2a_gtin_check upstream served gtins=${gtins.length}`);
  return res.json({
    ok: true,
    result: gtinCheck(gtins),
    provider: "Practical Automation Lab",
    billing: "handled_by_minia2a",
  });
}

function miniFeedDiff(req, res) {
  const payload = minia2aFeedPayload(req);
  const beforeError = feedRowError(payload.before, "before");
  if (beforeError) return res.status(400).json({ ok: false, error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(payload.after, "after");
  if (afterError) return res.status(400).json({ ok: false, error: "invalid_feed", detail: afterError });
  if (payload.before.length + payload.after.length < 1) {
    return res.status(400).json({
      ok: false,
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  console.log(
    `[revenue] minia2a_feed_diff upstream served before=${payload.before.length} after=${payload.after.length}`
  );
  return res.json({
    ok: true,
    result: feedDiff(payload.before, payload.after),
    provider: "Practical Automation Lab",
    billing: "handled_by_minia2a",
  });
}

function miniX402Validate(req, res) {
  const payload = minia2aDeclarationPayload(req);
  const validation = validateX402DeclarationBody(payload);
  if (!validation.ok) {
    return res.status(400).json({
      ok: false,
      error: "invalid_declaration",
      detail: validation.error,
    });
  }

  console.log("[revenue] minia2a_x402_validate upstream served");
  return res.json({
    ok: true,
    result: inspectX402Declaration(payload),
    provider: "Practical Automation Lab",
    billing: "handled_by_minia2a",
  });
}

app.get("/v1/minia2a/catalog-audit", miniCatalogAudit);
app.post("/v1/minia2a/catalog-audit", miniCatalogAudit);
app.get("/v1/minia2a/gtin-check", miniGtinCheck);
app.post("/v1/minia2a/gtin-check", miniGtinCheck);
app.get("/v1/minia2a/feed-diff", miniFeedDiff);
app.post("/v1/minia2a/feed-diff", miniFeedDiff);
app.get("/v1/minia2a/x402-validate", miniX402Validate);
app.post("/v1/minia2a/x402-validate", miniX402Validate);

app.get("/v1/minia2a/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    marketplace: "MiniA2A",
    provider: "Practical Automation Lab",
    payout_network: "Base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    platform_fee_2026: "0%",
    listings_ready: [
      {
        name: "PAL Catalog Feed Audit",
        endpoint: `${PUBLIC_BASE_URL}/v1/minia2a/catalog-audit`,
        price_cents: 3,
        category: "data",
        description:
          "Audit product-feed records for duplicate IDs, GTIN checksums, URL shape, price formatting, availability, and identifier consistency.",
      },
      {
        name: "PAL GTIN Check",
        endpoint: `${PUBLIC_BASE_URL}/v1/minia2a/gtin-check`,
        price_cents: 1,
        category: "tools",
        description:
          "Validate batches of GTIN-8, UPC/GTIN-12, GTIN-13, and GTIN-14 identifiers including check digits.",
      },
      {
        name: "PAL Product Feed Diff",
        endpoint: `${PUBLIC_BASE_URL}/v1/minia2a/feed-diff`,
        price_cents: 3,
        category: "data",
        description:
          "Compare two product-feed snapshots and report added, removed, and changed commerce fields by product ID.",
      },
      {
        name: "PAL x402 Declaration Validator",
        endpoint: `${PUBLIC_BASE_URL}/v1/minia2a/x402-validate`,
        price_cents: 5,
        category: "tools",
        description:
          "Validate x402 v2 PaymentRequired declarations for resource, payment scheme, network, amount, asset, payTo, and timeout consistency.",
      },
    ],
  });
});

app.get("/v1/upstream/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    provider: "Practical Automation Lab",
    payout_network: "Base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    marketplace_openapi: `${PUBLIC_BASE_URL}/marketplace-openapi.json`,
    endpoints: [
      {
        name: "PAL Catalog Feed Identifier Audit",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/catalog-audit`,
        max_items: 100,
      },
      {
        name: "PAL Catalog Remediation Plan",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/catalog-remediation`,
        max_items: 100,
        recommended_marketplace_tier: "premium",
      },
      {
        name: "PAL GTIN Check",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/gtin-check`,
        max_items: 100,
      },
      {
        name: "PAL Feed Diff",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/feed-diff`,
        max_rows_per_snapshot: 100,
      },
      {
        name: "PAL x402 Declaration Validator",
        method: "POST",
        url: `${PUBLIC_BASE_URL}/v1/upstream/x402-validate`,
        scope: "static x402 v2 declaration validation",
      },
    ],
  });
});

app.post("/v1/gigsoul/catalog-audit", (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length < 1 || records.length > 100) {
    return res.status(400).json({
      error: "invalid_records",
      detail: "Body must contain records as an array with 1 to 100 items.",
      example: catalogAuditExample(),
    });
  }

  const result = audit(records);
  console.log(
    `[revenue] gigsoul_catalog_audit served billing=handled_upstream records=${records.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
    generated_at: nowIso(),
    disclaimer:
      "Consistency audit only; not a guarantee of Merchant Center approval or regulatory compliance.",
  });
});

app.post("/v1/gigsoul/gtin-check", (req, res) => {
  const gtins = req.body?.gtins;
  if (!Array.isArray(gtins) || gtins.length < 1 || gtins.length > 100) {
    return res.status(400).json({
      error: "invalid_gtins",
      detail: "Body must contain gtins as an array with 1 to 100 values.",
      example: { gtins: ["4006381333931", "036000291452"] },
    });
  }
  for (let index = 0; index < gtins.length; index += 1) {
    const value = gtins[index];
    if (!["string", "number"].includes(typeof value) || String(value).trim() === "") {
      return res.status(400).json({
        error: "invalid_gtins",
        detail: `gtins[${index}] must be a non-empty string or number.`,
      });
    }
  }

  const result = gtinCheck(gtins);
  console.log(
    `[revenue] gigsoul_gtin_check served billing=handled_upstream gtins=${gtins.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.post("/v1/gigsoul/feed-diff", (req, res) => {
  const beforeError = feedRowError(req.body?.before, "before");
  if (beforeError) return res.status(400).json({ error: "invalid_feed", detail: beforeError });
  const afterError = feedRowError(req.body?.after, "after");
  if (afterError) return res.status(400).json({ error: "invalid_feed", detail: afterError });
  if (req.body.before.length + req.body.after.length < 1) {
    return res.status(400).json({
      error: "invalid_feed",
      detail: "At least one feed snapshot must contain a row.",
    });
  }

  const result = feedDiff(req.body.before, req.body.after);
  console.log(
    `[revenue] gigsoul_feed_diff served billing=handled_upstream before=${req.body.before.length} after=${req.body.after.length}`
  );

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.post("/v1/gigsoul/x402-validate", (req, res) => {
  const validation = validateX402DeclarationBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: "invalid_declaration",
      detail: validation.error,
    });
  }

  const result = inspectX402Declaration(req.body);
  console.log("[revenue] gigsoul_x402_validate served billing=handled_upstream");

  return res.json({
    ...result,
    marketplace: {
      provider: "GigSoul Agent Depot",
      billing: "handled_upstream",
      listed_price_usdc: "0.10",
      seller_wallet: BASE_PAYOUT_ADDRESS,
    },
  });
});

app.get("/v1/gigsoul/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    ok: true,
    marketplace: "GigSoul Agent Depot",
    service: "PAL Catalog Feed Auditor",
    endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/catalog-audit`,
    method: "POST",
    listed_price_usdc: "0.10",
    payout_network: "Base",
    payout_asset: "USDC",
    payout_address: BASE_PAYOUT_ADDRESS,
    limits: { records_per_call: 100 },
    sample_input: catalogAuditExample(),
    additional_services_ready_for_review: [
      {
        service: "PAL GTIN Check",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/gtin-check`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: { gtins: ["4006381333931", "036000291452"] },
      },
      {
        service: "PAL Feed Diff",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/feed-diff`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: {
          before: [{ id: "sku-1", price: "19.99 USD", availability: "in_stock" }],
          after: [{ id: "sku-1", price: "17.99 USD", availability: "in_stock" }],
        },
      },
      {
        service: "PAL x402 Declaration Validator",
        endpoint: `${PUBLIC_BASE_URL}/v1/gigsoul/x402-validate`,
        method: "POST",
        listed_price_usdc: "0.10",
        sample_input: {
          x402Version: 2,
          resource: { url: `${PUBLIC_BASE_URL}/v1/usdc/catalog-audit` },
          accepts: [{
            scheme: "exact",
            network: "eip155:8453",
            amount: "10000",
            asset: X402_ASSET,
            payTo: BASE_PAYOUT_ADDRESS,
            maxTimeoutSeconds: 60,
          }],
        },
      },
    ],
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
  setTimeout(() => void startAgent402Bootstrap(), 4_000);
  setTimeout(() => void startIndex402Bootstrap(), 8_000);
  setTimeout(() => void startIndex402ClaimBootstrap(), 20_000);
  setTimeout(() => void startX402ScoutBootstrap(), 12_000);
  setTimeout(() => void startAgentToolsBootstrap(), 16_000);
  setTimeout(() => void startOpenDexterAuditionBootstrap(), 24_000);
  setTimeout(() => void startTrue402Bootstrap(), 28_000);
  setTimeout(() => void startMarket402Bootstrap(), 32_000);
  setTimeout(() => void startX402DashBootstrap(), 36_000);
  setTimeout(() => void startNoHumansBootstrap(), 40_000);
});
