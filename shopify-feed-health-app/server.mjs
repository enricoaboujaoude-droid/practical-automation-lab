import compression from "compression";
import express from "express";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";
import * as build from "./build/server/index.js";
import { sanitizeRequestTarget } from "./server-logging.mjs";
import { startSpeedbotRegistration } from "./speedbot-agent.mjs";
import { startSpeedbotHelpAssignment } from "./speedbot-help.mjs";
import { startSuperteamScout } from "./superteam-agent.mjs";
import { startBasedAgentsScout } from "./basedagents-scout.mjs";
import { startTaskmarketScout } from "./taskmarket-scout.mjs";
import { startNearMarketAgent } from "./near-market-agent.mjs";
import { startSubnanoPublisher } from "./subnano-publisher.mjs";\nimport { startAgenticTradeReferralPublisher } from "./agentictrade-referral-publisher.mjs";
import {
  APIHUB_AUDIT_PATH,
  APIHUB_OPENAPI_PATH,
  apiHubCatalogAuditMetadata,
  apiHubCatalogAuditOpenApi,
  apiHubCatalogAuditPost,
} from "./apihub-catalog-audit.mjs";
import {
  nanoCatalogAuditMetadata,
  nanoCatalogAuditOptions,
  nanoCatalogAuditPost,
} from "./nano-catalog-audit.mjs";
import {
  nanoCommerceManifest,
  nanoCommerceOptions,
  nanoFeedDiffMetadata,
  nanoFeedDiffPost,
  nanoGtinMetadata,
  nanoGtinPost,
  nanoX402ValidateMetadata,
  nanoX402ValidatePost,
  nanoX402WellKnown,
} from "./nano-commerce-tools.mjs";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const mode = process.env.NODE_ENV || "production";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(compression());

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.status(200).json({ ok: true, service: "pal-catalog-check" });
});

app.head("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendStatus(200);
});

app.get(APIHUB_AUDIT_PATH, apiHubCatalogAuditMetadata);
app.get(APIHUB_OPENAPI_PATH, apiHubCatalogAuditOpenApi);
app.post(
  APIHUB_AUDIT_PATH,
  express.json({ limit: "128kb" }),
  apiHubCatalogAuditPost,
);

app.get("/api/nano/catalog-audit", nanoCatalogAuditMetadata);
app.options("/api/nano/catalog-audit", nanoCatalogAuditOptions);
app.post(
  "/api/nano/catalog-audit",
  express.json({ limit: "128kb" }),
  nanoCatalogAuditPost,
);

app.get("/api/nano/manifest", nanoCommerceManifest);
app.get("/.well-known/x402", nanoX402WellKnown);

app.get("/api/nano/gtin-check", nanoGtinMetadata);
app.options("/api/nano/gtin-check", nanoCommerceOptions);
app.post(
  "/api/nano/gtin-check",
  express.json({ limit: "64kb" }),
  nanoGtinPost,
);

app.get("/api/nano/feed-diff", nanoFeedDiffMetadata);
app.options("/api/nano/feed-diff", nanoCommerceOptions);
app.post(
  "/api/nano/feed-diff",
  express.json({ limit: "256kb" }),
  nanoFeedDiffPost,
);

app.get("/api/nano/x402-validate", nanoX402ValidateMetadata);
app.options("/api/nano/x402-validate", nanoCommerceOptions);
app.post(
  "/api/nano/x402-validate",
  express.json({ limit: "128kb" }),
  nanoX402ValidatePost,
);

app.use(
  "/assets",
  express.static("build/client/assets", {
    immutable: true,
    maxAge: "1y",
  }),
);
app.use(express.static("build/client", { maxAge: "1h" }));
app.use(express.static("public", { maxAge: "1h" }));

morgan.token("safe-url", (req) =>
  sanitizeRequestTarget(req.originalUrl || req.url || "/"),
);
app.use(
  morgan(":method :safe-url :status :res[content-length] - :response-time ms"),
);

app.all(
  "/{*splat}",
  createRequestHandler({
    build,
    mode,
  }),
);

app.listen(port, host, () => {
  console.log(`[pal-shopify] listening on ${host}:${port}`);
  startSpeedbotRegistration();
  startSpeedbotHelpAssignment();
  startSuperteamScout();
  startBasedAgentsScout();
  startTaskmarketScout();
  startNearMarketAgent();
  startSubnanoPublisher();\n  startAgenticTradeReferralPublisher();
});
