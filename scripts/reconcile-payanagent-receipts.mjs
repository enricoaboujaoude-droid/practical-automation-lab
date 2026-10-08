import fs from "node:fs";

const AGENT_ID = "j57eeka0x0jgdbq3th55ms988x8fx49e";
const URL = `https://payanagent.com/api/v1/agents/${AGENT_ID}/receipts?side=seller&limit=100`;
const response = await fetch(URL, {
  headers: { accept: "application/json", "user-agent": "Practical-Automation-Lab-Revenue-Monitor/1.0" },
  signal: AbortSignal.timeout(20000),
});
const text = await response.text();
let body;
try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
if (!response.ok) throw new Error(`PayanAgent receipts HTTP ${response.status}: ${text.slice(0,500)}`);

const receipts = Array.isArray(body) ? body : Array.isArray(body.receipts) ? body.receipts : Array.isArray(body.items) ? body.items : [];
const normalized = receipts.map((r) => ({
  id: r.id || r.receiptId || r._id || null,
  offer_id: r.offerId || r.offer_id || null,
  amount_usd: Number(r.amountUsd ?? r.amount_usd ?? r.priceUsd ?? r.price_usd ?? r.amount ?? 0),
  status: r.status || null,
  tx_hash: r.txHash || r.tx_hash || r.transactionHash || null,
  created_at: r.createdAt || r.created_at || r.timestamp || null,
  seller_id: r.sellerId || r.seller_id || null,
})).filter((r) => !r.seller_id || r.seller_id === AGENT_ID);

const settled = normalized.filter((r) => /paid|settled|completed|success/i.test(String(r.status || "")) || r.tx_hash);
const total = Number(settled.reduce((s,r)=>s+(Number.isFinite(r.amount_usd)?r.amount_usd:0),0).toFixed(6));

const out = {
  marketplace: "PayanAgent",
  seller_agent_id: AGENT_ID,
  checked_at: new Date().toISOString(),
  receipt_count: normalized.length,
  settled_receipt_count: settled.length,
  settled_total_usd: total,
  receipts: normalized,
  raw_shape_keys: body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).slice(0,25) : [],
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync("revenue/payanagent-receipts.json", JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({receipt_count:out.receipt_count, settled_receipt_count:out.settled_receipt_count, settled_total_usd:out.settled_total_usd, latest:settled.slice(-10)},null,2));
