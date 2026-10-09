import fs from "node:fs";

const RPC_URLS = [
  process.env.BASE_RPC_URL,
  "https://base.drpc.org",
  "https://base-mainnet.public.blastapi.io",
  "https://base.public.blockpi.network/v1/rpc/public",
  "https://base.api.onfinality.io/public",
  "https://base.rpc.subquery.network/public",
  "https://public.1rpc.io/base",
  "https://base-rpc.publicnode.com",
  "https://base.publicnode.com",
  "https://mainnet.base.org",
].filter((value, index, all) => value && all.indexOf(value) === index);

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAYOUT = "0x02d1DAe81eAdDdeD344eeE43c6f31A8E166432bF".toLowerCase();
const LEDGER_PATH = process.env.REVENUE_LEDGER_PATH || "revenue/base-usdc-ledger.json";
const BLOCKSCOUT_BASE = "https://base.blockscout.com";
const BLOCK_WINDOW = Number(process.env.BLOCK_WINDOW || 12000);
const OVERLAP = Number(process.env.BLOCK_OVERLAP || 2500);
const CHUNK = Number(process.env.BLOCK_CHUNK || 2000);
const RPC_DELAY_MS = Number(process.env.RPC_DELAY_MS || 450);
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TO_TOPIC = "0x" + "0".repeat(24) + PAYOUT.slice(2);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  fs.mkdirSync("revenue", { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

function mergeTransfer(ledger, transfer) {
  const known = new Set((ledger.transfers || []).map((x) => String(x.tx_hash || "").toLowerCase()));
  if (known.has(String(transfer.tx_hash || "").toLowerCase())) return false;
  ledger.transfers.push(transfer);
  return true;
}

async function scanBlockscout(ledger) {
  let next = {};
  let pages = 0;
  let added = 0;
  let maxBlock = Number(ledger.last_scanned_block || 0);

  do {
    const url = new URL(
      `/api/v2/addresses/${PAYOUT}/token-transfers`,
      BLOCKSCOUT_BASE,
    );
    url.searchParams.set("type", "ERC-20");
    url.searchParams.set("filter", "to");
    url.searchParams.set("token", USDC);
    for (const [key, value] of Object.entries(next || {})) {
      if (value !== null && value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "practical-automation-lab-revenue-ledger/1.3",
      },
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Blockscout HTTP ${response.status}: ${raw.slice(0, 500)}`);
    }

    const body = raw ? JSON.parse(raw) : {};
    const items = Array.isArray(body.items) ? body.items : [];
    for (const item of items) {
      const tokenAddress = String(item?.token?.address_hash || "").toLowerCase();
      const toAddress = String(item?.to?.hash || "").toLowerCase();
      if (tokenAddress !== USDC.toLowerCase() || toAddress !== PAYOUT) continue;

      const decimals = Number(item?.total?.decimals ?? item?.token?.decimals ?? 6);
      const rawValue = String(item?.total?.value ?? "0");
      const blockNumber = Number(item?.block_number || 0);
      maxBlock = Math.max(maxBlock, blockNumber);

      const transfer = {
        tx_hash: item?.transaction_hash,
        log_index: Number.isFinite(Number(item?.log_index)) ? Number(item.log_index) : null,
        block_number: blockNumber || null,
        timestamp: item?.timestamp || null,
        from: item?.from?.hash || null,
        to: item?.to?.hash || null,
        amount_usdc: Number(rawValue) / 10 ** decimals,
        source: "base_blockscout_v2",
      };
      if (transfer.tx_hash && mergeTransfer(ledger, transfer)) added += 1;
    }

    next =
      body.next_page_params && Object.keys(body.next_page_params).length
        ? body.next_page_params
        : null;
    pages += 1;
  } while (next && pages < 20);

  ledger.transfers.sort((a, b) => {
    const ab = Number(a.block_number || 0);
    const bb = Number(b.block_number || 0);
    if (ab !== bb) return ab - bb;
    return Number(a.log_index ?? -1) - Number(b.log_index ?? -1);
  });
  ledger.total_usdc = Number(
    ledger.transfers
      .reduce((sum, item) => sum + Number(item.amount_usdc || 0), 0)
      .toFixed(6),
  );
  if (maxBlock > 0) ledger.last_scanned_block = maxBlock;
  ledger.updated_at = new Date().toISOString();
  ledger.last_scan_source = "base_blockscout_v2";
  ledger.last_scan_error = null;
  writeLedger(ledger);

  return {
    source: "base_blockscout_v2",
    added,
    pages,
    transfer_count: ledger.transfers.length,
    total_usdc: ledger.total_usdc,
    latest_transfers: ledger.transfers.slice(-10),
  };
}

async function rpc(method, params) {
  let lastError;
  const maxAttempts = Math.max(12, RPC_URLS.length * 3);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const rpcUrl = RPC_URLS[attempt % RPC_URLS.length];
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "practical-automation-lab-revenue-ledger/1.3",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20_000),
      });

      if (response.ok) {
        const body = await response.json();
        if (!body.error) return body.result;
        lastError = new Error(
          `${method} RPC error via ${rpcUrl}: ${JSON.stringify(body.error)}`,
        );
      } else {
        lastError = new Error(`${method} HTTP ${response.status} via ${rpcUrl}`);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    const round = Math.floor(attempt / Math.max(1, RPC_URLS.length));
    await sleep(Math.min(10_000, 500 * 2 ** round));
  }

  throw lastError || new Error(`${method} failed across all configured Base RPCs`);
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

async function scanRpc(ledger) {
  const latest = Number.parseInt(await rpc("eth_blockNumber", []), 16);
  const safeStart = Math.max(0, latest - BLOCK_WINDOW);
  const overlapStart =
    Number.isInteger(ledger.last_scanned_block) && ledger.last_scanned_block > 0
      ? Math.max(safeStart, ledger.last_scanned_block - OVERLAP)
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

  let added = 0;
  for (const log of logs) {
    const blockNumber = Number.parseInt(log.blockNumber, 16);
    const transfer = {
      tx_hash: log.transactionHash,
      log_index: Number.parseInt(log.logIndex, 16),
      block_number: blockNumber,
      timestamp: await blockTimestamp(blockNumber),
      from: addressFromTopic(log.topics[1]),
      to: addressFromTopic(log.topics[2]),
      amount_usdc: Number(BigInt(log.data)) / 1_000_000,
      source: "base_rpc_logs",
    };
    if (mergeTransfer(ledger, transfer)) added += 1;
    await sleep(RPC_DELAY_MS);
  }

  ledger.transfers.sort(
    (a, b) =>
      Number(a.block_number || 0) - Number(b.block_number || 0) ||
      Number(a.log_index ?? -1) - Number(b.log_index ?? -1),
  );
  ledger.total_usdc = Number(
    ledger.transfers
      .reduce((sum, item) => sum + Number(item.amount_usdc || 0), 0)
      .toFixed(6),
  );
  ledger.last_scanned_block = latest;
  ledger.updated_at = new Date().toISOString();
  ledger.last_scan_source = "base_rpc_logs";
  ledger.last_scan_error = null;
  writeLedger(ledger);

  return {
    source: "base_rpc_logs",
    added,
    transfer_count: ledger.transfers.length,
    total_usdc: ledger.total_usdc,
    scanned_from_block: overlapStart,
    scanned_to_block: latest,
    latest_transfers: ledger.transfers.slice(-10),
  };
}

const ledger = readLedger();

try {
  const result = await scanBlockscout(ledger);
  console.log(JSON.stringify(result, null, 2));
} catch (blockscoutError) {
  console.warn(
    "Blockscout scan failed; falling back to RPC:",
    blockscoutError instanceof Error ? blockscoutError.message : String(blockscoutError),
  );
  try {
    const result = await scanRpc(ledger);
    console.log(JSON.stringify(result, null, 2));
  } catch (rpcError) {
    ledger.updated_at = new Date().toISOString();
    ledger.last_scan_source = "failed";
    ledger.last_scan_error =
      rpcError instanceof Error ? rpcError.message : String(rpcError);
    writeLedger(ledger);
    console.error(
      "Revenue proof scan unavailable; preserved prior ledger:",
      ledger.last_scan_error,
    );
    process.exitCode = 1;
  }
}
