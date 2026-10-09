import fs from "node:fs";

const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);
const OUT = "revenue/usdc-multichain-ledger.json";
const BASE_SOURCE = "revenue/base-usdc-ledger.json";

const chains = [
  {
    key: "polygon",
    chainId: 137,
    label: "Polygon",
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    window: 12000,
    overlap: 2500,
    chunk: 2000,
    rpcs: [
      "https://polygon.api.onfinality.io/public",
      "https://polygon.drpc.org",
      "https://public.1rpc.io/matic",
      "https://polygon-bor-rpc.publicnode.com",
    ],
  },
  {
    key: "arbitrum",
    chainId: 42161,
    label: "Arbitrum One",
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    window: 30000,
    overlap: 8000,
    chunk: 5000,
    rpcs: [
      "https://arbitrum.drpc.org",
      "https://arbitrum-one-rpc.publicnode.com",
      "https://arb1.arbitrum.io/rpc",
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(chain, method, params) {
  let last;
  const attempts = Math.max(4, chain.rpcs.length * 2);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const url = chain.rpcs[attempt % chain.rpcs.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "pal-revenue-ledger/2.2",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const body = await res.json();
        if (!body.error) return body.result;
        last = new Error(`${method} RPC error via ${url}: ${JSON.stringify(body.error)}`);
      } else {
        last = new Error(`${method} HTTP ${res.status} via ${url}`);
      }
    } catch (error) {
      last = error instanceof Error ? error : new Error(String(error));
    }
    await sleep(500 * (attempt + 1));
  }

  throw last || new Error(`${method} failed for ${chain.key}`);
}

function readJson(path, fallback) {
  if (!fs.existsSync(path)) return fallback;
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

const ledger = readJson(OUT, {
  schema_version: 2,
  payout_address: PAYOUT,
  asset: "USDC",
  transfers: [],
  totals_by_chain: {},
  total_usdc: 0,
  checkpoints: {},
  updated_at: null,
});

ledger.schema_version = 2;
ledger.payout_address = PAYOUT;
ledger.asset = "USDC";
ledger.transfers = (Array.isArray(ledger.transfers) ? ledger.transfers : []).filter(
  (item) => item?.chain !== "base",
);

const baseLedger = readJson(BASE_SOURCE, null);
if (baseLedger && Array.isArray(baseLedger.transfers)) {
  for (const item of baseLedger.transfers) {
    ledger.transfers.push({
      chain: "base",
      chain_id: 8453,
      chain_label: "Base",
      token: "USDC",
      token_contract: baseLedger.asset_contract || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      tx_hash: item.tx_hash,
      log_index: item.log_index ?? null,
      block_number: item.block_number ?? null,
      timestamp: item.timestamp ?? null,
      from: item.from ?? null,
      to: item.to ?? null,
      amount_usdc: Number(item.amount_usdc || 0),
      source: item.source || "base_ledger",
    });
  }
  ledger.checkpoints.base = {
    source: BASE_SOURCE,
    last_scanned_block: baseLedger.last_scanned_block ?? null,
    source_updated_at: baseLedger.updated_at ?? null,
    imported_at: new Date().toISOString(),
  };
}

const known = new Set(
  ledger.transfers.map(
    (item) =>
      `${item.chain_id}:${String(item.tx_hash || "").toLowerCase()}:${item.log_index ?? ""}`,
  ),
);

let added = 0;
const scanErrors = [];

for (const chain of chains) {
  try {
    const latest = Number.parseInt(await rpc(chain, "eth_blockNumber", []), 16);
    const previous = Number(ledger.checkpoints?.[chain.key]?.last_scanned_block || 0);
    const from =
      previous > 0
        ? Math.max(Math.max(0, latest - chain.window), Math.max(0, previous - chain.overlap))
        : Math.max(0, latest - chain.window);

    const logs = [];
    for (let start = from; start <= latest; start += chain.chunk) {
      const end = Math.min(latest, start + chain.chunk - 1);
      const batch = await rpc(chain, "eth_getLogs", [
        {
          address: chain.usdc,
          fromBlock: "0x" + start.toString(16),
          toBlock: "0x" + end.toString(16),
          topics: [TRANSFER_TOPIC, null, TO_TOPIC],
        },
      ]);
      logs.push(...batch);
      await sleep(250);
    }

    for (const log of logs) {
      const blockNumber = Number.parseInt(log.blockNumber, 16);
      const logIndex = Number.parseInt(log.logIndex, 16);
      const key = `${chain.chainId}:${String(log.transactionHash).toLowerCase()}:${logIndex}`;
      if (known.has(key)) continue;

      const block = await rpc(chain, "eth_getBlockByNumber", [
        "0x" + blockNumber.toString(16),
        false,
      ]);
      const timestamp = new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString();

      ledger.transfers.push({
        chain: chain.key,
        chain_id: chain.chainId,
        chain_label: chain.label,
        token: "USDC",
        token_contract: chain.usdc,
        tx_hash: log.transactionHash,
        log_index: logIndex,
        block_number: blockNumber,
        timestamp,
        from: "0x" + String(log.topics[1]).slice(-40),
        to: "0x" + String(log.topics[2]).slice(-40),
        amount_usdc: Number(BigInt(log.data)) / 10 ** chain.decimals,
        source: "rpc_logs",
      });
      known.add(key);
      added += 1;
    }

    ledger.checkpoints[chain.key] = {
      last_scanned_block: latest,
      scanned_from_block: from,
      updated_at: new Date().toISOString(),
    };
  } catch (error) {
    scanErrors.push({
      chain: chain.key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

ledger.transfers.sort((a, b) => {
  const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
  const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
  return at - bt;
});

ledger.totals_by_chain = {};
for (const item of ledger.transfers) {
  const key = item.chain || "unknown";
  ledger.totals_by_chain[key] = Number(
    ((ledger.totals_by_chain[key] || 0) + Number(item.amount_usdc || 0)).toFixed(6),
  );
}
ledger.total_usdc = Number(
  ledger.transfers.reduce((sum, item) => sum + Number(item.amount_usdc || 0), 0).toFixed(6),
);
ledger.updated_at = new Date().toISOString();
ledger.scan_errors = scanErrors;

fs.mkdirSync("revenue", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(ledger, null, 2) + "\n");

console.log(
  JSON.stringify(
    {
      added,
      base_imported: Boolean(baseLedger),
      scan_errors: scanErrors,
      transfer_count: ledger.transfers.length,
      totals_by_chain: ledger.totals_by_chain,
      total_usdc: ledger.total_usdc,
      latest_transfers: ledger.transfers.slice(-10),
    },
    null,
    2,
  ),
);
