import fs from "node:fs";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const LEDGER_PATH = process.env.REVENUE_LEDGER_PATH || "revenue/base-usdc-ledger.json";
const BLOCK_WINDOW = Number(process.env.BLOCK_WINDOW || 30000);
const CHUNK = 450;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);

async function rpc(method, params) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return {
      schema_version: 1,
      network: "base-mainnet",
      asset: "USDC",
      asset_contract: USDC,
      payout_address: PAYOUT,
      transfers: [],
      total_usdc: 0,
      last_scanned_block: null,
      updated_at: null,
    };
  }
  return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
}

function writeLedger(ledger) {
  fs.mkdirSync(new URL("../revenue/", import.meta.url), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

function addressFromTopic(topic) {
  return "0x" + String(topic).slice(-40);
}

async function blockTimestamp(blockNumber) {
  const block = await rpc("eth_getBlockByNumber", [
    "0x" + Number(blockNumber).toString(16),
    false,
  ]);
  return new Date(Number.parseInt(block.timestamp, 16) * 1000).toISOString();
}

const ledger = readLedger();
const latest = Number.parseInt(await rpc("eth_blockNumber", []), 16);
const safeStart = Math.max(0, latest - BLOCK_WINDOW);
const overlapStart =
  Number.isInteger(ledger.last_scanned_block) && ledger.last_scanned_block > 0
    ? Math.max(safeStart, ledger.last_scanned_block - 1000)
    : safeStart;

const logs = [];
for (let start = overlapStart; start <= latest; start += CHUNK) {
  const end = Math.min(latest, start + CHUNK - 1);
  const batch = await rpc("eth_getLogs", [
    {
      address: USDC,
      fromBlock: "0x" + start.toString(16),
      toBlock: "0x" + end.toString(16),
      topics: [TRANSFER_TOPIC, null, TO_TOPIC],
    },
  ]);
  logs.push(...batch);
}

const existing = new Set(
  (ledger.transfers || []).map(
    (item) => `${String(item.tx_hash).toLowerCase()}:${item.log_index}`,
  ),
);

let added = 0;
for (const log of logs) {
  const key = `${String(log.transactionHash).toLowerCase()}:${Number.parseInt(
    log.logIndex,
    16,
  )}`;
  if (existing.has(key)) continue;

  const blockNumber = Number.parseInt(log.blockNumber, 16);
  ledger.transfers.push({
    tx_hash: log.transactionHash,
    log_index: Number.parseInt(log.logIndex, 16),
    block_number: blockNumber,
    timestamp: await blockTimestamp(blockNumber),
    from: addressFromTopic(log.topics[1]),
    to: addressFromTopic(log.topics[2]),
    amount_usdc: Number(BigInt(log.data)) / 1_000_000,
  });
  existing.add(key);
  added += 1;
}

ledger.transfers.sort(
  (a, b) =>
    a.block_number - b.block_number ||
    a.log_index - b.log_index,
);
ledger.total_usdc = Number(
  ledger.transfers
    .reduce((sum, item) => sum + Number(item.amount_usdc || 0), 0)
    .toFixed(6),
);
ledger.last_scanned_block = latest;
ledger.updated_at = new Date().toISOString();
writeLedger(ledger);

console.log(
  JSON.stringify(
    {
      added,
      transfer_count: ledger.transfers.length,
      total_usdc: ledger.total_usdc,
      scanned_from_block: overlapStart,
      scanned_to_block: latest,
      latest_transfers: ledger.transfers.slice(-10),
    },
    null,
    2,
  ),
);
