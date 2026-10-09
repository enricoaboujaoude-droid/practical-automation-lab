import express from "express";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware } from "@x402/express";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { facilitator } from "@payai/facilitator";

const app = express();
app.use(express.json({ limit: "64kb" }));

const PORT = Number(process.env.PORT || 10000);
const PAY_TO = String(process.env.PAL_BASE_PAYOUT_ADDRESS || "").trim();
const FACILITATOR_URL = "https://facilitator.payai.network";
const NETWORK = "eip155:8453";
const PUBLIC_ORIGIN = String(process.env.PUBLIC_BASE_URL || "https://pal-base-risk-revenue.onrender.com").replace(/\/$/, "");
let index402VerificationHash = "";

if (!/^0x[a-fA-F0-9]{40}$/.test(PAY_TO)) {
  throw new Error("PAL_BASE_PAYOUT_ADDRESS must be a valid public EVM address");
}

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:*", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

const tokenInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["address"],
  properties: {
    address: {
      type: "string",
      pattern: "^0x[a-fA-F0-9]{40}$",
      description: "Base ERC-20 token contract address."
    }
  }
};

const portfolioInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["addresses"],
  properties: {
    addresses: {
      type: "array",
      minItems: 2,
      maxItems: 10,
      uniqueItems: true,
      items: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
      description: "Two to ten Base ERC-20 token contract addresses."
    }
  }
};

function discovery(input, inputSchema, outputExample) {
  return {
    ...declareDiscoveryExtension({
      input,
      inputSchema,
      bodyType: "json",
      output: { example: outputExample }
    })
  };
}

app.use(
  paymentMiddleware(
    {
      "POST /v1/base-token-risk-verdict": {
        accepts: {
          scheme: "exact",
          price: "$0.05",
          network: NETWORK,
          payTo: PAY_TO
        },
        description:
          "Derived Base token risk verdict from live token-security data. Returns a deterministic 0-100 safety score, risk band, and concrete flags for honeypot, trading restrictions, taxes, source visibility, proxy use, trust-list status, and holder concentration.",
        mimeType: "application/json",
        serviceName: "PAL Base Token Risk Verdict",
        tags: ["base", "token", "risk", "security", "verdict", "derived-data"],
        extensions: discovery(
          { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
          tokenInputSchema,
          {
            service: "PAL Base Token Risk Verdict",
            token: { symbol: "USDC" },
            safety_score: 95,
            risk_band: "low",
            flags: []
          }
        )
      },
      "POST /v1/base-token-due-diligence": {
        accepts: {
          scheme: "exact",
          price: "$5.00",
          network: NETWORK,
          payTo: PAY_TO
        },
        description:
          "Full deterministic Base ERC-20 due-diligence pack from live security data. Includes safety score, risk band, taxes, source/proxy status, buy restrictions, trust-list status, holder concentration, creator/owner exposure, top-holder summary, and ranked risk factors.",
        mimeType: "application/json",
        serviceName: "PAL Base Token Due Diligence",
        tags: ["base", "token", "due-diligence", "security", "risk", "portfolio"],
        extensions: discovery(
          { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
          tokenInputSchema,
          {
            service: "PAL Base Token Due Diligence",
            safety_score: 95,
            risk_band: "low",
            risk_factors: [],
            top_holder_concentration: 0.31
          }
        )
      },
      "POST /v1/base-token-portfolio-rank": {
        accepts: {
          scheme: "exact",
          price: "$25.00",
          network: NETWORK,
          payTo: PAY_TO
        },
        description:
          "Rank 2-10 Base ERC-20 token contracts by deterministic security risk in one paid call. Returns per-token live security evidence, safety scores, risk bands, concentration metrics, and a safest-to-riskiest ranking.",
        mimeType: "application/json",
        serviceName: "PAL Base Token Portfolio Risk Rank",
        tags: ["base", "portfolio", "token", "risk", "security", "ranking", "due-diligence"],
        extensions: discovery(
          {
            addresses: [
              "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              "0x4200000000000000000000000000000000000006"
            ]
          },
          portfolioInputSchema,
          {
            service: "PAL Base Token Portfolio Risk Rank",
            ranked: [
              { address: "0x...", safety_score: 95, risk_band: "low" },
              { address: "0x...", safety_score: 72, risk_band: "medium" }
            ]
          }
        )
      }
    },
    resourceServer
  )
);

function validAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function yes(value) {
  return String(value) === "1";
}

function scoreToken(address, raw = {}) {
  let score = 100;
  const factors = [];

  const add = (penalty, code, severity, evidence) => {
    score -= penalty;
    factors.push({ code, severity, evidence });
  };

  if (yes(raw.is_honeypot)) add(65, "honeypot", "critical", true);
  if (yes(raw.cannot_buy)) add(45, "cannot_buy", "critical", true);
  if (String(raw.is_open_source) === "0") add(20, "not_open_source", "high", true);

  const buyTax = numberOrNull(raw.buy_tax);
  const sellTax = numberOrNull(raw.sell_tax);
  const transferTax = numberOrNull(raw.transfer_tax);
  if (buyTax !== null && buyTax >= 0.1) add(12, "high_buy_tax", "high", buyTax);
  else if (buyTax !== null && buyTax >= 0.03) add(5, "elevated_buy_tax", "medium", buyTax);
  if (sellTax !== null && sellTax >= 0.1) add(18, "high_sell_tax", "high", sellTax);
  else if (sellTax !== null && sellTax >= 0.03) add(7, "elevated_sell_tax", "medium", sellTax);
  if (transferTax !== null && transferTax >= 0.05) add(6, "transfer_tax", "medium", transferTax);

  const holders = Array.isArray(raw.holders) ? raw.holders : [];
  const top10Concentration = holders
    .slice(0, 10)
    .reduce((sum, h) => sum + (numberOrNull(h?.percent) || 0), 0);
  if (top10Concentration >= 0.75) add(18, "top10_concentration_extreme", "high", top10Concentration);
  else if (top10Concentration >= 0.5) add(10, "top10_concentration_high", "medium", top10Concentration);

  const creatorPercent = numberOrNull(raw.creator_percent);
  if (creatorPercent !== null && creatorPercent >= 0.2) add(15, "creator_concentration", "high", creatorPercent);
  else if (creatorPercent !== null && creatorPercent >= 0.08) add(7, "creator_concentration", "medium", creatorPercent);

  if (String(raw.trust_list) === "1") {
    score = Math.min(100, score + 5);
  }

  score = Math.max(0, Math.round(score));
  const riskBand =
    score >= 85 ? "low" :
    score >= 65 ? "medium" :
    score >= 40 ? "high" : "critical";

  return {
    address: address.toLowerCase(),
    token: {
      name: raw.token_name || null,
      symbol: raw.token_symbol || null,
      total_supply: raw.total_supply || null,
      holder_count: raw.holder_count || null
    },
    safety_score: score,
    risk_band: riskBand,
    risk_factors: factors,
    evidence: {
      is_honeypot: raw.is_honeypot ?? null,
      cannot_buy: raw.cannot_buy ?? null,
      is_open_source: raw.is_open_source ?? null,
      is_proxy: raw.is_proxy ?? null,
      trust_list: raw.trust_list ?? null,
      buy_tax: raw.buy_tax ?? null,
      sell_tax: raw.sell_tax ?? null,
      transfer_tax: raw.transfer_tax ?? null,
      creator_address: raw.creator_address || null,
      creator_percent: raw.creator_percent ?? null,
      owner_address: raw.owner_address || null,
      top10_holder_concentration: Number(top10Concentration.toFixed(6)),
      cex: raw.is_in_cex || null
    },
    top_holders: holders.slice(0, 10).map((h) => ({
      address: h?.address || null,
      percent: numberOrNull(h?.percent),
      is_contract: h?.is_contract ?? null,
      is_locked: h?.is_locked ?? null
    }))
  };
}

async function fetchSecurity(addresses) {
  const url = new URL("https://api.gopluslabs.io/api/v1/token_security/8453");
  url.searchParams.set("contract_addresses", addresses.map((x) => x.toLowerCase()).join(","));
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "Practical-Automation-Lab-Bazaar-Revenue/1.0"
    },
    signal: AbortSignal.timeout(20_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || Number(body?.code) !== 1 || !body?.result) {
    throw new Error(`GoPlus upstream failed: HTTP ${response.status} ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body.result;
}

app.get("/", (_req, res) => {
  res.json({
    service: "Practical Automation Lab Bazaar Revenue",
    network: NETWORK,
    settlement: "Base USDC via x402",
    facilitator: FACILITATOR_URL,
    products: [
      { path: "/v1/base-token-risk-verdict", price_usd: 0.05 },
      { path: "/v1/base-token-due-diligence", price_usd: 5 },
      { path: "/v1/base-token-portfolio-rank", price_usd: 25 }
    ]
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "pal-bazaar-revenue", checked_at: new Date().toISOString() });
});

app.get("/.well-known/mpp32-verify", async (_req, res) => {
  try {
    const response = await fetch(
      "https://raw.githubusercontent.com/enricoaboujaoude-droid/practical-automation-lab/bazaar-revenue/revenue/mpp32-verification-token.txt",
      {
        headers: { accept: "text/plain", "user-agent": "PAL-MPP32-Verify/1.0" },
        signal: AbortSignal.timeout(8000)
      }
    );
    if (!response.ok) return res.status(404).type("text/plain").send("verification_not_ready");
    const token = (await response.text()).trim();
    if (!/^[a-fA-F0-9]{64}$/.test(token)) {
      return res.status(404).type("text/plain").send("verification_not_ready");
    }
    res.set("Cache-Control", "no-store");
    return res.type("text/plain").send(token);
  } catch {
    return res.status(503).type("text/plain").send("verification_unavailable");
  }
});

app.get("/.well-known/402index-verify.txt", (_req, res) => {
  res.set("Cache-Control", "no-store");
  if (!index402VerificationHash) {
    return res.status(404).type("text/plain").send("verification_not_ready");
  }
  return res.type("text/plain").send(index402VerificationHash);
});

app.get("/.well-known/x402-service.json", (_req, res) => {
  res.json({
    x402: "1.0",
    name: "Practical Automation Lab Base Token Risk",
    description:
      "Machine-paid Base token security verdicts and portfolio risk ranking using live security evidence plus deterministic PAL scoring.",
    capabilities: [
      "base",
      "erc20",
      "token-risk",
      "due-diligence",
      "portfolio-ranking",
      "security"
    ],
    pricing: {
      currency: "USDC",
      base: "25.00",
      unit: "portfolio-risk-rank"
    },
    payment: {
      address: PAY_TO,
      chain: "base-mainnet",
      facilitator: FACILITATOR_URL
    },
    endpoint: PUBLIC_ORIGIN + "/v1/base-token-portfolio-rank",
    endpoints: [
      {
        name: "PAL Base Token Risk Verdict",
        endpoint: PUBLIC_ORIGIN + "/v1/base-token-risk-verdict",
        method: "POST",
        price: "0.05"
      },
      {
        name: "PAL Base Token Due Diligence",
        endpoint: PUBLIC_ORIGIN + "/v1/base-token-due-diligence",
        method: "POST",
        price: "5.00"
      },
      {
        name: "PAL Base Token Portfolio Risk Rank",
        endpoint: PUBLIC_ORIGIN + "/v1/base-token-portfolio-rank",
        method: "POST",
        price: "25.00"
      }
    ]
  });
});

app.get("/.well-known/x402", (_req, res) => {
  const origin = PUBLIC_ORIGIN;
  res.json({
    version: 2,
    name: "Practical Automation Lab Bazaar Revenue",
    resources: [
      {
        resource: `${origin}/v1/base-token-risk-verdict`,
        method: "POST",
        price: "$0.05",
        network: NETWORK,
        payTo: PAY_TO,
        description: "Derived Base token security verdict."
      },
      {
        resource: `${origin}/v1/base-token-due-diligence`,
        method: "POST",
        price: "$5.00",
        network: NETWORK,
        payTo: PAY_TO,
        description: "Full Base token due-diligence pack."
      },
      {
        resource: `${origin}/v1/base-token-portfolio-rank`,
        method: "POST",
        price: "$25.00",
        network: NETWORK,
        payTo: PAY_TO,
        description: "Rank 2-10 Base tokens by deterministic security risk."
      }
    ]
  });
});

app.post("/v1/base-token-risk-verdict", async (req, res) => {
  const address = String(req.body?.address || "");
  if (!validAddress(address)) return res.status(400).json({ error: "address must be a Base ERC-20 contract address" });
  try {
    const raw = await fetchSecurity([address]);
    const row = raw[address.toLowerCase()];
    if (!row) return res.status(404).json({ error: "token security data not found" });
    const scored = scoreToken(address, row);
    res.json({
      service: "PAL Base Token Risk Verdict",
      source: "GoPlus Token Security API + PAL deterministic scoring",
      checked_at: new Date().toISOString(),
      address: scored.address,
      token: scored.token,
      safety_score: scored.safety_score,
      risk_band: scored.risk_band,
      flags: scored.risk_factors,
      evidence: scored.evidence,
      disclaimer: "Automated directional risk analysis; not financial advice or a security guarantee."
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/v1/base-token-due-diligence", async (req, res) => {
  const address = String(req.body?.address || "");
  if (!validAddress(address)) return res.status(400).json({ error: "address must be a Base ERC-20 contract address" });
  try {
    const raw = await fetchSecurity([address]);
    const row = raw[address.toLowerCase()];
    if (!row) return res.status(404).json({ error: "token security data not found" });
    res.json({
      service: "PAL Base Token Due Diligence",
      source: "GoPlus Token Security API + PAL deterministic scoring",
      checked_at: new Date().toISOString(),
      ...scoreToken(address, row),
      disclaimer: "Automated directional due diligence; not financial advice or a security guarantee."
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/v1/base-token-portfolio-rank", async (req, res) => {
  const addresses = Array.isArray(req.body?.addresses)
    ? [...new Set(req.body.addresses.map((x) => String(x)))]
    : [];
  if (addresses.length < 2 || addresses.length > 10 || addresses.some((x) => !validAddress(x))) {
    return res.status(400).json({ error: "addresses must contain 2-10 unique Base ERC-20 contract addresses" });
  }
  try {
    const raw = await fetchSecurity(addresses);
    const ranked = addresses
      .map((address) => {
        const row = raw[address.toLowerCase()];
        return row ? scoreToken(address, row) : {
          address: address.toLowerCase(),
          token: { name: null, symbol: null },
          safety_score: 0,
          risk_band: "unknown",
          risk_factors: [{ code: "security_data_unavailable", severity: "unknown", evidence: true }],
          evidence: {},
          top_holders: []
        };
      })
      .sort((a, b) => b.safety_score - a.safety_score);
    res.json({
      service: "PAL Base Token Portfolio Risk Rank",
      source: "GoPlus Token Security API + PAL deterministic scoring",
      checked_at: new Date().toISOString(),
      token_count: ranked.length,
      ranked,
      safest: ranked[0],
      riskiest: ranked[ranked.length - 1],
      disclaimer: "Automated directional due diligence; not financial advice or a security guarantee."
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

async function verify402IndexDomain() {
  const domain = new URL(PUBLIC_ORIGIN).hostname;
  try {
    const claim = await fetch("https://402index.io/api/v1/claim", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ domain, contact_email: "enricoaboujaoude@gmail.com" }),
      signal: AbortSignal.timeout(30_000)
    });
    const claimBody = await claim.json().catch(() => ({}));

    if (claim.status === 409) {
      console.log("[402index] domain already verified");
      return;
    }
    if (!claim.ok) {
      console.log(`[402index] claim failed status=${claim.status}`);
      return;
    }

    const hash = String(claimBody?.verification_hash || "").trim();
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
      console.log("[402index] claim returned no verification hash");
      return;
    }
    index402VerificationHash = hash;

    await new Promise(resolve => setTimeout(resolve, 5000));

    const verify = await fetch("https://402index.io/api/v1/claim/verify", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(30_000)
    });
    const verifyBody = await verify.json().catch(() => ({}));
    console.log(
      `[402index] verify status=${verify.status} result=${String(verifyBody?.status || "unknown")} services=${verifyBody?.services_count ?? "unknown"}`
    );
  } catch (error) {
    console.log(`[402index] domain verification error=${String(error?.message || error).slice(0,200)}`);
  }
}

app.listen(PORT, () => {
  console.log(`PAL Bazaar revenue service listening on :${PORT} facilitator=${FACILITATOR_URL}`);
  setTimeout(() => void verify402IndexDomain(), 3000);
});
