import fs from "node:fs";

const RPC_URLS = [
  process.env.BASE_RPC_URL,
  "https://base-rpc.publicnode.com",
  "https://mainnet.base.org",
  "https://base.llamarpc.com",
].filter((value, index, all) => value && all.indexOf(value) === index);
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const LEDGER_PATH = process.env.REVENUE_LEDGER_PATH || "revenue/base-usdc-ledger.json";
const BLOCK_WINDOW = Number(process.env.BLOCK_WINDOW || 30000);
const CHUNK = 450;
const RPC_DELAY_MS = Number(process.env.RPC_DELAY_MS || 300);
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, params) {
  let lastError;
  const maxAttempts = Math.max(9, RPC_URLS.length * 3);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rpcUrl = RPC_URLS[attempt % RPC_URLS.length];
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "practical-automation-lab-revenue-ledger/1.1",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });

      if (response.ok) {
        const body = await response.json();
        if (body.error) {
          const message = `${method} RPC error via ${rpcUrl}: ${JSON.stringify(body.error)}`;
          const retryable =
            Number(body.error.code) === -32005 ||
            /rate|limit|busy|timeout|temporar/i.test(String(body.error.message || ""));
          if (!retryable) throw new Error(message);
          lastError = new Error(message);
        } else {
          return body.result;
        }
      } else {
        lastError = new Error(`${method} HTTP ${response.status} via ${rpcUrl}`);
        if (response.status !== 429 && response.status < 500) throw lastError;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    const round = Math.floor(attempt / Math.max(1, RPC_URLS.length));
    await sleep(Math.min(8000, 500 * 2 ** round));
  }

  throw lastError || new Error(`${method} failed across all configured Base RPCs`);
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
    ? Math.max(safeStart, ledger.last_scanned_block - BLOCK_WINDOW)
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
  await sleep(RPC_DELAY_MS);
}

const existing = new Set(
  (ledger.transfers || []).map((item) => String(item.tx_hash).toLowerCase()),
);

let added = 0;
for (const log of logs) {
  const key = String(log.transactionHash).toLowerCase();
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
  await sleep(RPC_DELAY_MS);
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
