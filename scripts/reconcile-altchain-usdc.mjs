import fs from "node:fs";

const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const CHAINS = [
  {
    key: "polygon",
    label: "Polygon",
    explorer: "https://polygon.blockscout.com",
    token: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359".toLowerCase(),
  },
  {
    key: "arbitrum",
    label: "Arbitrum One",
    explorer: "https://arbitrum.blockscout.com",
    token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase(),
  },
];

async function readChain(chain) {
  const url = new URL(`/api/v2/addresses/${PAYOUT}/token-transfers`, chain.explorer);
  url.searchParams.set("type", "ERC-20");
  url.searchParams.set("filter", "to");
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "PAL-Revenue-Proof/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${chain.key} explorer HTTP ${response.status}: ${text.slice(0,400)}`);
  const body = JSON.parse(text);
  const items = Array.isArray(body.items) ? body.items : [];
  return items
    .filter((x) => String(x?.to?.hash || x?.to_hash || x?.to || "").toLowerCase() === PAYOUT)
    .filter((x) => String(x?.token?.address_hash || x?.token?.address || x?.token?.contract_address_hash || "").toLowerCase() === chain.token)
    .map((x) => {
      const decimals = Number(x?.token?.decimals ?? 6);
      const raw = x?.total?.value ?? x?.value ?? "0";
      const amount = Number(raw) / 10 ** decimals;
      return {
        chain: chain.key,
        chain_label: chain.label,
        tx_hash: x?.transaction_hash || x?.tx_hash || x?.transactionHash || null,
        block_number: x?.block_number ?? null,
        timestamp: x?.timestamp || null,
        from: x?.from?.hash || x?.from_hash || null,
        to: x?.to?.hash || x?.to_hash || null,
        token: "USDC",
        token_contract: chain.token,
        amount_usdc: amount,
      };
    });
}

const transfers = [];
const errors = [];
for (const chain of CHAINS) {
  try {
    transfers.push(...await readChain(chain));
  } catch (e) {
    errors.push({ chain: chain.key, error: e instanceof Error ? e.message : String(e) });
  }
}
transfers.sort((a,b)=>new Date(a.timestamp||0)-new Date(b.timestamp||0));
const sinceOct8 = transfers.filter((x) => !x.timestamp || new Date(x.timestamp) >= new Date("2026-10-08T00:00:00Z"));
const total = Number(transfers.reduce((s,x)=>s+Number(x.amount_usdc||0),0).toFixed(6));
const oct8Total = Number(sinceOct8.reduce((s,x)=>s+Number(x.amount_usdc||0),0).toFixed(6));

const out = {
  payout_address: PAYOUT,
  checked_at: new Date().toISOString(),
  chains_checked: CHAINS.map(x=>x.key),
  errors,
  transfer_count: transfers.length,
  total_usdc_visible: total,
  since_2026_10_08_usdc: oct8Total,
  transfers,
};

fs.mkdirSync("revenue",{recursive:true});
fs.writeFileSync("revenue/altchain-usdc-ledger.json",JSON.stringify(out,null,2)+"\n");
console.log(JSON.stringify({errors, transfer_count:transfers.length,total_usdc_visible:total,since_2026_10_08_usdc:oct8Total,recent:sinceOct8.slice(-20)},null,2));
if (errors.length === CHAINS.length) process.exit(1);
