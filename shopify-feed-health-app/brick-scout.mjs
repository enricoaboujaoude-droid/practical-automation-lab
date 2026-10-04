const BRICK_BASE = "https://brick.blue";

async function readJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`status=${response.status} body=${text.replace(/\s+/g, " ").slice(0, 180)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`invalid_json body=${text.replace(/\s+/g, " ").slice(0, 180)}`);
  }
}

function taskRows(body) {
  const candidates =
    Array.isArray(body) ? body :
    Array.isArray(body?.tasks) ? body.tasks :
    Array.isArray(body?.data) ? body.data :
    Array.isArray(body?.items) ? body.items : [];

  return candidates.slice(0, 40).map((task) => ({
    id: task?.id || task?.taskId || null,
    title: String(task?.title || "").slice(0, 120),
    state: task?.state || task?.status || null,
    mode: task?.mode || task?.workMode || null,
    skill: task?.skill || null,
    rewardAmount: task?.rewardAmount ?? task?.reward ?? task?.payment?.amount ?? null,
    currency: task?.currency || task?.payment?.currency || task?.asset || null,
    acceptance: task?.acceptance?.type || task?.acceptanceType || null,
    tags: Array.isArray(task?.tags) ? task.tags.slice(0, 8) : [],
  }));
}

export async function probeBrickMarket() {
  const [tasksResult, earningsResult] = await Promise.allSettled([
    readJson(`${BRICK_BASE}/api/v1/tasks?state=open&payment=paid`),
    readJson(`${BRICK_BASE}/api/v1/earnings`),
  ]);

  if (tasksResult.status === "fulfilled") {
    console.log(
      `[brick-scout] tasks=${JSON.stringify(taskRows(tasksResult.value))}`,
    );
  } else {
    console.error(
      `[brick-scout] tasks_failed message=${String(tasksResult.reason?.message || tasksResult.reason).slice(0, 240)}`,
    );
  }

  if (earningsResult.status === "fulfilled") {
    const e = earningsResult.value || {};
    console.log(
      `[brick-scout] earnings=${JSON.stringify({
        paid24h: e.paid24h ?? e.paid_24h ?? e.last24h ?? null,
        paid7d: e.paid7d ?? e.paid_7d ?? e.last7d ?? null,
        fillRate: e.fillRate ?? e.fill_rate ?? null,
        recentPayouts: Array.isArray(e.recentPayouts ?? e.recent_payouts)
          ? (e.recentPayouts ?? e.recent_payouts).slice(0, 10)
          : null,
      })}`,
    );
  } else {
    console.error(
      `[brick-scout] earnings_failed message=${String(earningsResult.reason?.message || earningsResult.reason).slice(0, 240)}`,
    );
  }
}

export function startBrickScout() {
  void probeBrickMarket().catch((error) => {
    console.error(
      `[brick-scout] failed message=${String(error?.message || error).replace(/\s+/g, " ").slice(0, 240)}`,
    );
  });
}
