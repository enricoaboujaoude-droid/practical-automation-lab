import fs from "node:fs";

const BASE = "https://payanagent.com";
async function get(path) {
  const res = await fetch(BASE + path, {
    headers: { accept: "application/json", "user-agent": "PAL-Market-Demand-Scanner/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${text.slice(0,400)}`);
  return text ? JSON.parse(text) : {};
}

const feed = await get("/api/v1/receipts?limit=100");
const receipts = Array.isArray(feed) ? feed : Array.isArray(feed.receipts) ? feed.receipts : Array.isArray(feed.items) ? feed.items : [];
const offerIds = [...new Set(receipts.map(r => r.offerId || r.offer_id).filter(Boolean))].slice(0,40);

const offerDetails = [];
for (const id of offerIds) {
  try {
    const body = await get("/api/v1/offers/" + encodeURIComponent(id));
    const o = body.offer || body;
    offerDetails.push({
      id,
      title: o.title || null,
      category: o.category || null,
      tags: Array.isArray(o.tags) ? o.tags : [],
      offer_type: o.offerType || o.offer_type || null,
      price_usd: Number(o.priceUsd ?? o.price_usd ?? (Number(o.priceCents ?? o.price_cents ?? 0)/100)),
      seller_id: o.sellerId || o.seller_id || null,
    });
  } catch {}
}

const detailById = new Map(offerDetails.map(o=>[String(o.id),o]));
const normalizedReceipts = receipts.map(r => {
  const offerId = r.offerId || r.offer_id || null;
  const offer = offerId ? detailById.get(String(offerId)) : null;
  const amountCents = Number(r.amountCents ?? r.amount_cents ?? r.priceCents ?? r.price_cents ?? 0);
  const amountUsd = Number(r.amountUsd ?? r.amount_usd ?? (amountCents ? amountCents/100 : 0));
  return {
    receipt_id: r.id || r.receiptId || r.receipt_id || null,
    offer_id: offerId,
    title: offer?.title || r.offerTitle || r.title || null,
    category: offer?.category || r.category || null,
    tags: offer?.tags || [],
    offer_type: offer?.offer_type || null,
    amount_usd: amountUsd || offer?.price_usd || 0,
    seller_id: r.sellerId || r.seller_id || offer?.seller_id || null,
    buyer_id: r.buyerId || r.buyer_id || null,
    tx_hash: r.txHash || r.tx_hash || null,
    created_at: r.createdAt || r.created_at || r.timestamp || null,
  };
});

const byOffer = new Map();
for (const r of normalizedReceipts) {
  const key = r.offer_id || r.title || "unknown";
  const x = byOffer.get(key) || { offer_id:r.offer_id,title:r.title,category:r.category,tags:r.tags,receipts:0,revenue_usd:0,max_price_usd:0 };
  x.receipts++;
  x.revenue_usd += Number(r.amount_usd||0);
  x.max_price_usd = Math.max(x.max_price_usd, Number(r.amount_usd||0));
  byOffer.set(key,x);
}
const leaders = [...byOffer.values()]
  .map(x=>({...x,revenue_usd:Number(x.revenue_usd.toFixed(6))}))
  .sort((a,b)=>b.revenue_usd-a.revenue_usd || b.receipts-a.receipts);

const out = {
  checked_at: new Date().toISOString(),
  receipt_count: normalizedReceipts.length,
  distinct_paid_offers: leaders.length,
  total_visible_usd: Number(normalizedReceipts.reduce((s,r)=>s+Number(r.amount_usd||0),0).toFixed(6)),
  top_paid_offers: leaders.slice(0,30),
  recent_receipts: normalizedReceipts.slice(0,100),
};

fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/payanagent-market-demand.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({
  receipt_count:out.receipt_count,
  total_visible_usd:out.total_visible_usd,
  top_paid_offers:out.top_paid_offers.slice(0,15)
},null,2));
