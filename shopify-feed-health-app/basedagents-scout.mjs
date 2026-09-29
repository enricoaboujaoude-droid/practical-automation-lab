const DEFAULT_BASE_URL = "https://api.basedagents.ai";
const DEFAULT_MIN_USDC = "1.00";
const DEFAULT_SCOUT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MIN_SCOUT_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SCOUT_INTERVAL_MS = 24 * 60 * 60 * 1000;

function cleanBaseUrl(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function safeText(value, max = 240) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function positiveUsdc(value, fallback = DEFAULT_MIN_USDC) {
  const text = String(value ?? fallback).trim();
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(text)) return fallback;
  if (Number(text) <= 0) return fallback;
  return text;
}

export function resolveBasedAgentsScoutIntervalMs(
  value = process.env.BASEDAGENTS_SCOUT_INTERVAL_MS,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SCOUT_INTERVAL_MS;
  return Math.min(
    MAX_SCOUT_INTERVAL_MS,
    Math.max(MIN_SCOUT_INTERVAL_MS, Math.floor(parsed)),
  );
}

export function publicBasedAgentsTaskSummary(task) {
  const bounty =
    task?.bounty && typeof task.bounty === "object" ? task.bounty : null;
  const escrow =
    task?.escrow && typeof task.escrow === "object" ? task.escrow : null;

  return {
    id: safeText(task?.task_id, 160),
    title: safeText(task?.title, 240),
    category: safeText(task?.category, 80),
    createdAt: safeText(task?.created_at, 100),
    bounty: bounty
      ? {
          amount: safeText(bounty.amount_display, 60),
          token: safeText(bounty.token, 20),
          network: safeText(bounty.network, 80),
        }
      : null,
    paymentStatus: safeText(task?.payment_status, 80),
    escrowStatus: safeText(escrow?.status, 80),
    claimable: task?.claimable === true,
  };
}

export function selectPaidBasedAgentsTasks(tasks) {
  if (!Array.isArray(tasks)) return [];

  return tasks
    .filter((task) => {
      if (!task || task.status !== "open" || task.claimable !== true) {
        return false;
      }
      const bounty = task.bounty;
      if (!bounty || bounty.token !== "USDC") return false;
      if (bounty.network !== "eip155:8453") return false;
      const amount = Number(bounty.amount_display);
      return Number.isFinite(amount) && amount > 0;
    })
    .map(publicBasedAgentsTaskSummary);
}

export async function fetchOpenBasedAgentsTasks({
  fetchImpl = fetch,
  baseUrl = process.env.BASEDAGENTS_API_BASE || DEFAULT_BASE_URL,
  minUsdc = process.env.BASEDAGENTS_MIN_USDC || DEFAULT_MIN_USDC,
} = {}) {
  const url = new URL("/v1/tasks", cleanBaseUrl(baseUrl));
  url.searchParams.set("status", "open");
  url.searchParams.set("min_usdc", positiveUsdc(minUsdc));
  url.searchParams.set("limit", "100");

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "PAL-BasedAgents-Scout/1.0",
    },
    signal: AbortSignal.timeout(12000),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `BasedAgents task board returned HTTP ${response.status}: ${String(
        body?.error || body?.message || "request rejected",
      ).slice(0, 300)}`,
    );
  }
  if (body?.ok !== true || !Array.isArray(body?.tasks)) {
    throw new Error("BasedAgents task board returned an unexpected response.");
  }

  return selectPaidBasedAgentsTasks(body.tasks);
}

export async function runBasedAgentsScout(options = {}) {
  const tasks = await fetchOpenBasedAgentsTasks(options);
  return { status: "ready", count: tasks.length, tasks };
}

export function startBasedAgentsScout() {
  if (
    String(process.env.BASEDAGENTS_SCOUT_ENABLED || "true").toLowerCase() ===
    "false"
  ) {
    console.log("[pal-basedagents] scout disabled");
    return;
  }

  const intervalMs = resolveBasedAgentsScoutIntervalMs();

  const run = () => {
    runBasedAgentsScout()
      .then((result) => {
        console.log(
          `[pal-basedagents] status=${result.status} count=${
            result.count
          } tasks=${JSON.stringify(result.tasks)}`,
        );
      })
      .catch((error) => {
        console.error(
          "[pal-basedagents] scout deferred:",
          error?.message || error,
        );
      })
      .finally(() => {
        const next = setTimeout(run, intervalMs);
        next.unref?.();
      });
  };

  const initial = setTimeout(run, 12000);
  initial.unref?.();
}
