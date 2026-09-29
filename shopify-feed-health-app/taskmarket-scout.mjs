const DEFAULT_BASE_URL = "https://api.taskmarket.dev";
const DEFAULT_MIN_USDC = "5.00";
const DEFAULT_SCOUT_INTERVAL_MS = 60 * 60 * 1000;
const MIN_SCOUT_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SCOUT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function safeText(value, max = 500) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function normalizeDecimalUsdc(value, fallback = DEFAULT_MIN_USDC) {
  const text = String(value ?? fallback).trim();
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(text)) return fallback;
  return Number(text) > 0 ? text : fallback;
}

export function usdcToAtomic(value) {
  const text = normalizeDecimalUsdc(value);
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 1_000_000n + BigInt((fraction + "000000").slice(0, 6));
}

export function atomicToUsdc(value) {
  let raw;
  try {
    raw = BigInt(String(value ?? "0"));
  } catch {
    return null;
  }
  if (raw < 0n) return null;
  const whole = raw / 1_000_000n;
  const fraction = String(raw % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function resolveTaskmarketScoutIntervalMs(
  value = process.env.TASKMARKET_SCOUT_INTERVAL_MS,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCOUT_INTERVAL_MS;
  return Math.min(
    MAX_SCOUT_INTERVAL_MS,
    Math.max(MIN_SCOUT_INTERVAL_MS, Math.floor(parsed)),
  );
}

export function publicTaskmarketTaskSummary(task) {
  return {
    id: safeText(task?.id, 160),
    description: safeText(task?.description, 360),
    rewardUsdc: atomicToUsdc(task?.reward),
    mode: safeText(task?.mode, 40),
    status: safeText(task?.status, 40),
    tags: Array.isArray(task?.tags)
      ? task.tags.map((tag) => safeText(tag, 60)).filter(Boolean).slice(0, 12)
      : [],
    requesterActorType: safeText(task?.requesterActorType, 20),
    stakeRequired: task?.stakeRequired === true,
    stakeBps: Number.isFinite(Number(task?.stakeBps)) ? Number(task.stakeBps) : null,
    createdAt: safeText(task?.createdAt, 100),
    expiryTime: safeText(task?.expiryTime, 100),
  };
}

export function selectPaidTaskmarketTasks(
  tasks,
  { minUsdc = DEFAULT_MIN_USDC, now = Date.now() } = {},
) {
  if (!Array.isArray(tasks)) return [];
  const minimum = usdcToAtomic(minUsdc);

  return tasks
    .filter((task) => {
      if (!task || task.status !== "open") return false;
      if (task.stakeRequired === true) return false;
      if (!["bounty", "claim", "pitch"].includes(task.mode)) return false;

      let reward;
      try {
        reward = BigInt(String(task.reward ?? "0"));
      } catch {
        return false;
      }
      if (reward < minimum) return false;

      const expiry = Date.parse(String(task.expiryTime || ""));
      if (Number.isFinite(expiry) && expiry <= now) return false;

      return true;
    })
    .map(publicTaskmarketTaskSummary);
}

export async function fetchOpenTaskmarketTasks({
  fetchImpl = fetch,
  baseUrl = process.env.TASKMARKET_API_BASE || DEFAULT_BASE_URL,
  minUsdc = process.env.TASKMARKET_MIN_USDC || DEFAULT_MIN_USDC,
} = {}) {
  const url = new URL("/api/tasks", cleanBaseUrl(baseUrl));
  url.searchParams.set("status", "open");
  url.searchParams.set("phase", "active");
  url.searchParams.set("minReward", String(usdcToAtomic(minUsdc)));
  url.searchParams.set("sort", "reward_desc");
  url.searchParams.set("limit", "100");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PAL-Taskmarket-Scout/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Taskmarket task board returned HTTP ${response.status}: ${String(
        body?.error || body?.message || "request rejected",
      ).slice(0, 300)}`,
    );
  }
  if (!Array.isArray(body?.tasks)) {
    throw new Error("Taskmarket task board returned an unexpected response.");
  }

  return selectPaidTaskmarketTasks(body.tasks, { minUsdc });
}

export async function runTaskmarketScout(options = {}) {
  const tasks = await fetchOpenTaskmarketTasks(options);
  return { status: "ready", count: tasks.length, tasks };
}

export function startTaskmarketScout() {
  if (
    String(process.env.TASKMARKET_SCOUT_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.log("[pal-taskmarket] scout disabled");
    return;
  }

  const intervalMs = resolveTaskmarketScoutIntervalMs();

  const run = () => {
    runTaskmarketScout()
      .then((result) => {
        console.log(
          `[pal-taskmarket] status=${result.status} count=${
            result.count
          } tasks=${JSON.stringify(result.tasks)}`,
        );
      })
      .catch((error) => {
        console.error(
          "[pal-taskmarket] scout deferred:",
          error?.message || error,
        );
      })
      .finally(() => {
        const next = setTimeout(run, intervalMs);
        next.unref?.();
      });
  };

  const initial = setTimeout(run, 15000);
  initial.unref?.();
}
