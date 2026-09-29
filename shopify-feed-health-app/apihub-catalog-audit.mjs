import crypto from "node:crypto";

import {
  auditCatalog,
  bodyDigest,
  validateAuditBody,
} from "./nano-catalog-audit.mjs";

export const APIHUB_HEADER = "X-PAL-API-Key";
export const APIHUB_AUDIT_PATH = "/api/apihub/catalog-audit";
export const APIHUB_OPENAPI_PATH = "/api/apihub/openapi.json";
const MAX_BODY_BYTES = "128kb";

function configuredToken() {
  return String(process.env.PAL_APIHUB_UPSTREAM_TOKEN || "").trim();
}

export function apiHubTokenMatches(provided, expected = configuredToken()) {
  const candidate = String(provided || "");
  const secret = String(expected || "");

  if (secret.length < 32 || candidate.length !== secret.length) return false;

  const candidateBuffer = Buffer.from(candidate, "utf8");
  const secretBuffer = Buffer.from(secret, "utf8");
  if (candidateBuffer.length !== secretBuffer.length) return false;

  return crypto.timingSafeEqual(candidateBuffer, secretBuffer);
}

function noStore(res) {
  res.set("Cache-Control", "no-store");
}

export function apiHubCatalogAuditMetadata(_req, res) {
  noStore(res);
  res.status(200).json({
    ok: true,
    service: "PAL Catalog Audit",
    description:
      "Deterministic preflight audit for Shopify and product-feed catalog hygiene before syndication to shopping channels.",
    endpoint: APIHUB_AUDIT_PATH,
    method: "POST",
    max_products: 100,
    upstream_auth_header: APIHUB_HEADER,
    openapi: APIHUB_OPENAPI_PATH,
    checks: [
      "required and duplicate product ids",
      "titles",
      "product links",
      "image links",
      "prices",
      "availability",
      "brand coverage",
      "GTIN/MPN identifier coverage",
    ],
  });
}

export function apiHubCatalogAuditOpenApi(_req, res) {
  noStore(res);
  res.status(200).json({
    openapi: "3.0.3",
    info: {
      title: "PAL Catalog Audit API",
      version: "1.0.0",
      description:
        "Deterministic catalog/feed preflight for product-data hygiene. Designed for APIHub provider proxy metering.",
    },
    servers: [{ url: "https://pal-catalog-check-app.onrender.com" }],
    paths: {
      [APIHUB_AUDIT_PATH]: {
        get: {
          summary: "Describe the PAL Catalog Audit service",
          responses: {
            200: {
              description: "Service metadata",
            },
          },
        },
        post: {
          summary: "Audit a bounded product catalog",
          description:
            "Audit 1-100 product rows for common product-feed and shopping-data defects.",
          security: [{ ApiHubUpstreamKey: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["products"],
                  properties: {
                    products: {
                      type: "array",
                      minItems: 1,
                      maxItems: 100,
                      items: {
                        type: "object",
                        required: [
                          "id",
                          "title",
                          "link",
                          "image_link",
                          "price",
                          "availability",
                        ],
                        properties: {
                          id: { type: "string", example: "sku-123" },
                          title: { type: "string", example: "Example product" },
                          link: {
                            type: "string",
                            format: "uri",
                            example: "https://example.com/products/sku-123",
                          },
                          image_link: {
                            type: "string",
                            format: "uri",
                            example: "https://example.com/images/sku-123.jpg",
                          },
                          price: {
                            oneOf: [
                              { type: "number", minimum: 0 },
                              { type: "string", example: "19.99 USD" },
                            ],
                          },
                          availability: {
                            type: "string",
                            enum: ["in_stock", "out_of_stock", "preorder", "backorder"],
                          },
                          brand: { type: "string" },
                          gtin: { type: "string" },
                          mpn: { type: "string" },
                        },
                        additionalProperties: true,
                      },
                    },
                  },
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            200: {
              description: "Catalog audit report",
            },
            400: {
              description: "Invalid request",
            },
            401: {
              description: "Missing or invalid provider proxy credential",
            },
            503: {
              description: "Provider route is not configured",
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiHubUpstreamKey: {
          type: "apiKey",
          in: "header",
          name: APIHUB_HEADER,
        },
      },
    },
  });
}

export function apiHubJsonParser(express) {
  return express.json({ limit: MAX_BODY_BYTES });
}

export async function apiHubCatalogAuditPost(req, res) {
  noStore(res);

  const secret = configuredToken();
  if (secret.length < 32) {
    return res.status(503).json({
      error: "provider_route_not_configured",
      message: "The provider-only audit route is not configured.",
    });
  }

  if (!apiHubTokenMatches(req.get(APIHUB_HEADER), secret)) {
    return res.status(401).json({
      error: "unauthorized",
      message: "A valid provider proxy credential is required.",
    });
  }

  const validation = validateAuditBody(req.body);
  if (!validation.ok) {
    return res.status(400).json({
      error: "invalid_request",
      message: validation.error,
    });
  }

  const report = auditCatalog(req.body.products);
  const digest = bodyDigest(req.body);

  return res.status(200).json({
    ...report,
    service: "PAL Catalog Audit",
    channel: "apihub",
    audit_id: crypto
      .createHash("sha256")
      .update(`pal-apihub-audit:${digest}`)
      .digest("hex")
      .slice(0, 24),
  });
}
