import fs from "node:fs";

const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const SOURCE = "revenue/usdc-multichain-ledger.json";
const OUT = "revenue/altchain-usdc-ledger.json";

let source = {
  payout_address: PAYOUT,
  transfers: [],
  totals_by_chain: {},
  updated_at: null,
};

if (fs.existsSync(SOURCE)) {
  source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
}

const transfers = (Array.isArray(source.transfers) ? source.transfers : [])
  .filter((x) => x?.chain === "polygon" || x?.chain === "arbitrum")
  .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

const sinceOct8 = transfers.filter(
  (x) => !x.timestamp || new Date(x.timestamp) >= new Date("2026-10-08T00:00:00Z"),
);
const total = Number(transfers.reduce((s, x) => s + Number(x.amount_usdc || 0), 0).toFixed(6));
const oct8Total = Number(sinceOct8.reduce((s, x) => s + Number(x.amount_usdc || 0), 0).toFixed(6));

const out = {
  payout_address: PAYOUT,
  checked_at: new Date().toISOString(),
  source: SOURCE,
  source_updated_at: source.updated_at || null,
  chains_checked: ["polygon", "arbitrum"],
  source_scan_errors: Array.isArray(source.scan_errors)
    ? source.scan_errors.filter((x) => x?.chain === "polygon" || x?.chain === "arbitrum")
    : [],
  transfer_count: transfers.length,
  total_usdc_visible: total,
  since_2026_10_08_usdc: oct8Total,
  transfers,
};

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({
  transfer_count: transfers.length,
  total_usdc_visible: total,
  since_2026_10_08_usdc: oct8Total,
  recent: sinceOct8.slice(-20),
  source_updated_at: out.source_updated_at,
  source_scan_errors: out.source_scan_errors,
}, null, 2));

// Current proof is derived from the resilient multichain ledger.
