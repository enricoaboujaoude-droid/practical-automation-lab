import fs from "node:fs";

const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);
const OUT = "revenue/usdc-multichain-ledger.json";

const chains = [
  {
    key: "base",
    chainId: 8453,
    label: "Base",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    window: 35000,
    chunk: 1000,
    rpcs: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"],
  },
  {
    key: "polygon",
    chainId: 137,
    label: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    window: 40000,
    chunk: 2000,
    rpcs: ["https://polygon-bor-rpc.publicnode.com", "https://polygon-rpc.com"],
  },
  {
    key: "arbitrum",
    chainId: 42161,
    label: "Arbitrum One",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    window: 300000,
    chunk: 5000,
    rpcs: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(chain, method, params) {
  let last;
  for (let attempt = 0; attempt < chain.rpcs.length * 4; attempt++) {
    const url = chain.rpcs[attempt % chain.rpcs.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "pal-revenue-ledger/2.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`${method} HTTP ${res.status} via ${url}`);
      const body = await res.json();
      if (body.error) throw new Error(`${method} RPC error via ${url}: ${JSON.stringify(body.error)}`);
      return body.result;
    } catch (e) {
      last = e;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last || new Error(`${method} failed for ${chain.key}`);
}

function existingLedger() {
  if (!fs.existsSync(OUT)) {
    return {
      schema_version: 1,
      payout_address: PAYOUT,
      asset: "USDC",
      transfers: [],
      totals_by_chain: {},
      total_usdc: 0,
      checkpoints: {},
      updated_at: null,
    };
  }
  return JSON.parse(fs.readFileSync(OUT, "utf8"));
}

async function timestamp(chain, blockNumber) {
  const block = await rpc(chain, "eth_getBlockByNumber", ["0x" + blockNumber.toString(16), false]);
  return new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString();
}

const ledger = existingLedger();
const known = new Set((ledger.transfers || []).map((x) => `${x.chain_id}:${x.tx_hash.toLowerCase()}:${x.log_index}`));
let added = 0;

for (const chain of chains) {
  const latest = Number.parseInt(await rpc(chain, "eth_blockNumber", []), 16);
  const previous = Number(ledger.checkpoints?.[chain.key]?.last_scanned_block || 0);
  const from = previous > 0
    ? Math.max(0, Math.min(previous - Math.min(chain.window, 10000), latest - chain.window))
    : Math.max(0, latest - chain.window);

  const logs = [];
  for (let start = from; start <= latest; start += chain.chunk) {
    const end = Math.min(latest, start + chain.chunk - 1);
    const batch = await rpc(chain, "eth_getLogs", [{
      address: chain.usdc,
      fromBlock: "0x" + start.toString(16),
      toBlock: "0x" + end.toString(16),
      topics: [TRANSFER_TOPIC, null, TO_TOPIC],
    }]);
    logs.push(...batch);
    await sleep(120);
  }

  for (const log of logs) {
    const blockNumber = Number.parseInt(log.blockNumber, 16);
    const logIndex = Number.parseInt(log.logIndex, 16);
    const key = `${chain.chainId}:${String(log.transactionHash).toLowerCase()}:${logIndex}`;
    if (known.has(key)) continue;
    const amount = Number(BigInt(log.data)) / 10 ** chain.decimals;
    ledger.transfers.push({
      chain: chain.key,
      chain_id: chain.chainId,
      chain_label: chain.label,
      token: "USDC",
      token_contract: chain.usdc,
      tx_hash: log.transactionHash,
      log_index: logIndex,
      block_number: blockNumber,
      timestamp: await timestamp(chain, blockNumber),
      from: "0x" + String(log.topics[1]).slice(-40),
      to: "0x" + String(log.topics[2]).slice(-40),
      amount_usdc: amount,
    });
    known.add(key);
    added++;
  }

  ledger.checkpoints[chain.key] = {
    last_scanned_block: latest,
    scanned_from_block: from,
    updated_at: new Date().toISOString(),
  };
}

ledger.transfers.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
ledger.totals_by_chain = {};
for (const t of ledger.transfers) {
  ledger.totals_by_chain[t.chain] = Number(((ledger.totals_by_chain[t.chain] || 0) + Number(t.amount_usdc || 0)).toFixed(6));
}
ledger.total_usdc = Number(ledger.transfers.reduce((s, t) => s + Number(t.amount_usdc || 0), 0).toFixed(6));
ledger.updated_at = new Date().toISOString();

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(ledger, null, 2) + "\n");

console.log(JSON.stringify({
  added,
  transfer_count: ledger.transfers.length,
  totals_by_chain: ledger.totals_by_chain,
  total_usdc: ledger.total_usdc,
  latest_transfers: ledger.transfers.slice(-10),
}, null, 2));
