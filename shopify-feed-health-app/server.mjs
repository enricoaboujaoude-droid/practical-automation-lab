import compression from "compression";
import express from "express";
import morgan from "morgan";
import { createRequestHandler } from "@react-router/express";
import * as build from "./build/server/index.js";
import { sanitizeRequestTarget } from "./server-logging.mjs";
import { readSpeedbotRecord, startSpeedbotRegistration } from "./speedbot-agent.mjs";
import { startSpeedbotHelpAssignment } from "./speedbot-help.mjs";
import {
  startSpeedbotDirectedFieldTestHandoff,
  startSpeedbotDirectedFieldTestRequest,
} from "./speedbot-field-test.mjs";
import { ensureSpeedbotCommercialService, startSpeedbotCommercialService } from "./speedbot-commercial-service.mjs";
import { startSuperteamScout } from "./superteam-agent.mjs";
import { startBasedAgentsScout } from "./basedagents-scout.mjs";
import { startTaskmarketScout } from "./taskmarket-scout.mjs";
import { startNearMarketAgent } from "./near-market-agent.mjs";
import { startSubnanoPublisher } from "./subnano-publisher.mjs";
import { startAgenticTradeReferralPublisher } from "./agentictrade-referral-publisher.mjs";
import { startX402ExpansionReportPublisher } from "./x402-expansion-report-publisher.mjs";
import { startFirstUsdcSaleReportPublisher } from "./first-usdc-sale-report-publisher.mjs";
import { startSubnanoRevenueIndexPublisher } from "./subnano-revenue-index-publisher.mjs";
import { startPremiumRevenueReportPublisher } from "./premium-revenue-report-publisher.mjs";
import { startPremiumAutonomousRevenueReportPublisher } from "./subnano-premium-autonomous-revenue-report.mjs";
import { startTrue402ReportPublisher } from "./true402-report-publisher.mjs";
import { startPartnerRevenueProbe } from "./partner-revenue-probe.mjs";
import { startBrickScout } from "./brick-scout.mjs";
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

const SPEEDBOT_BIND_WALLET_ADDRESS = String(
  process.env.SPEEDBOT_BIND_WALLET_ADDRESS || "",
).trim();
const SPEEDBOT_BIND_BASE_URL = String(
  process.env.SPEEDBOT_BASE_URL || "https://speedbot.dev",
).replace(/\/+$/, "");
let speedbotWalletMessageLastAt = 0;

function validEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

async function speedbotPrivatePost(pathname, apiKey, payload) {
  const response = await fetch(`${SPEEDBOT_BIND_BASE_URL}${pathname}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "PAL-Speedbot-Wallet-Bind/1.0",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!response.ok) {
    throw new Error(
      `Speedbot ${pathname} returned HTTP ${response.status}: ${String(
        body?.error || body?.message || body?.detail || body?.raw || "request failed",
      ).slice(0, 500)}`,
    );
  }
  return body;
}

app.get("/speedbot-wallet-bind", (_req, res) => {
  if (!validEvmAddress(SPEEDBOT_BIND_WALLET_ADDRESS)) {
    return res
      .status(503)
      .type("text/plain")
      .send("Speedbot wallet binding is not configured.");
  }

  res.set("Cache-Control", "no-store");
  res.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAL · Bind Speedbot payout wallet</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#f7f7f5;color:#161616;margin:0;padding:32px}
main{max-width:680px;margin:0 auto;background:white;border:1px solid #ddd;border-radius:18px;padding:28px}
h1{font-size:24px;margin-top:0} p{line-height:1.55}.address{font-family:ui-monospace,monospace;overflow-wrap:anywhere;background:#f3f3f1;padding:12px;border-radius:10px}
button{border:0;border-radius:10px;padding:12px 18px;background:#111;color:white;font-weight:650;cursor:pointer}
button[disabled]{opacity:.55;cursor:wait}.note{font-size:14px;color:#555}.ok{color:#176b35}.err{color:#9c241f;white-space:pre-wrap}
</style>
</head>
<body>
<main>
<h1>Bind PAL’s Speedbot payout wallet</h1>
<p>This one-time step enables PAL’s fixed-price Speedbot service. It signs a message only; it does not send USDC, approve tokens, or authorize future transfers.</p>
<p class="address" id="target">${SPEEDBOT_BIND_WALLET_ADDRESS}</p>
<button id="bind">Connect wallet and sign</button>
<p class="note">Use the wallet that controls the address shown above. Reject the wallet prompt if it requests a transaction instead of a message signature.</p>
<p id="status"></p>
</main>
<script>
const target = ${JSON.stringify(SPEEDBOT_BIND_WALLET_ADDRESS)};
const button = document.getElementById("bind");
const status = document.getElementById("status");
function setStatus(message, ok=false) {
  status.textContent = message;
  status.className = ok ? "ok" : "err";
}
button.addEventListener("click", async () => {
  button.disabled = true;
  try {
    if (!window.ethereum) throw new Error("No EVM wallet extension was detected in this browser.");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = String(accounts && accounts[0] || "");
    if (address.toLowerCase() !== target.toLowerCase()) {
      throw new Error("Connected wallet does not match PAL’s configured payout address.");
    }

    setStatus("Preparing the Speedbot binding message…");
    const messageResponse = await fetch("/internal/speedbot-wallet-message", { method: "POST" });
    const messageBody = await messageResponse.json();
    if (!messageResponse.ok) throw new Error(messageBody.error || "Could not prepare the binding message.");

    const message = String(
      messageBody.message ||
      messageBody.wallet_message ||
      messageBody.message_to_sign ||
      messageBody.text ||
      ""
    );
    const requestId = String(messageBody.request_id || messageBody.requestId || "");
    if (!message || !requestId) {
      throw new Error("Speedbot returned an unexpected wallet-message shape.");
    }

    setStatus("Check the wallet prompt. Sign the message only — do not approve a transaction.");
    let signature;
    try {
      signature = await window.ethereum.request({
        method: "personal_sign",
        params: [message, address],
      });
    } catch (firstError) {
      signature = await window.ethereum.request({
        method: "personal_sign",
        params: [address, message],
      });
    }

    setStatus("Verifying the signature with Speedbot…");
    const bindResponse = await fetch("/internal/speedbot-wallet-bind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signature, request_id: requestId }),
    });
    const bindBody = await bindResponse.json();
    if (!bindResponse.ok) throw new Error(bindBody.error || "Speedbot rejected the signature.");

    const serviceStatus = String(bindBody.service?.status || "unknown");
    setStatus(
      serviceStatus === "published" || serviceStatus === "already_published"
        ? "Wallet bound. PAL’s $20 Speedbot service is live."
        : "Wallet bound successfully. PAL is completing service publication.",
      true,
    );
  } catch (error) {
    setStatus(String(error && error.message || error));
  } finally {
    button.disabled = false;
  }
});
</script>
</body>
</html>`);
});

app.post("/internal/speedbot-wallet-message", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    if (!validEvmAddress(SPEEDBOT_BIND_WALLET_ADDRESS)) {
      return res.status(503).json({ error: "Speedbot wallet binding is not configured." });
    }
    const now = Date.now();
    if (now - speedbotWalletMessageLastAt < 5_000) {
      return res.status(429).json({ error: "Please wait a few seconds before requesting another binding message." });
    }
    speedbotWalletMessageLastAt = now;

    const record = await readSpeedbotRecord();
    const apiKey = String(record?.api_key || "").trim();
    if (!apiKey) {
      return res.status(503).json({ error: "PAL’s Speedbot agent key is not available on this service." });
    }

    const body = await speedbotPrivatePost(
      "/api/exchange/wallet_message",
      apiKey,
      { address: SPEEDBOT_BIND_WALLET_ADDRESS },
    );
    return res.json(body);
  } catch (error) {
    console.error("[pal-speedbot-bind] wallet_message_failed", error instanceof Error ? error.message : String(error));
    return res.status(502).json({ error: "Could not prepare the Speedbot wallet-binding message." });
  }
});

app.post(
  "/internal/speedbot-wallet-bind",
  express.json({ limit: "32kb" }),
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const signature = String(req.body?.signature || "").trim();
      const requestId = String(req.body?.request_id || "").trim();
      if (!/^0x[a-fA-F0-9]+$/.test(signature) || signature.length > 16_386) {
        return res.status(400).json({ error: "Invalid wallet signature." });
      }
      if (!/^[a-zA-Z0-9_.:-]{8,100}$/.test(requestId)) {
        return res.status(400).json({ error: "Invalid Speedbot request id." });
      }

      const record = await readSpeedbotRecord();
      const apiKey = String(record?.api_key || "").trim();
      if (!apiKey) {
        return res.status(503).json({ error: "PAL’s Speedbot agent key is not available on this service." });
      }

      const binding = await speedbotPrivatePost(
        "/api/exchange/bind_wallet",
        apiKey,
        {
          address: SPEEDBOT_BIND_WALLET_ADDRESS,
          signature,
          request_id: requestId,
        },
      );
      const service = await ensureSpeedbotCommercialService();

      console.log(
        `[pal-speedbot-bind] wallet_bound=true service_status=${service.status} service_id=${service.serviceId || "none"}`,
      );
      return res.json({ ok: true, binding, service });
    } catch (error) {
      console.error("[pal-speedbot-bind] bind_failed", error instanceof Error ? error.message : String(error));
      return res.status(502).json({ error: "Speedbot wallet binding failed. No payment was sent." });
    }
  },
);

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
  startSpeedbotDirectedFieldTestRequest();
  startSpeedbotDirectedFieldTestHandoff();
  startSpeedbotCommercialService();
  startSuperteamScout();
  startBasedAgentsScout();
  startTaskmarketScout();
  startNearMarketAgent();
  startSubnanoPublisher();
  startAgenticTradeReferralPublisher();
  startX402ExpansionReportPublisher();
  startFirstUsdcSaleReportPublisher();
  startSubnanoRevenueIndexPublisher();
  startPremiumRevenueReportPublisher();
  startPremiumAutonomousRevenueReportPublisher();
  startTrue402ReportPublisher();
  startPartnerRevenueProbe();
  startBrickScout();
});
