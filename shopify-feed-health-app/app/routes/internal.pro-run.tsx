import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authorizeProRunner } from "../lib/pro-run-auth.server";
import { runDueProMonitoring } from "../lib/pro-monitoring-runner.server";
import { fetchPartnerRevenueSummary } from "../lib/partner-api.server";

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response("Method not allowed.", {
    status: 405,
    headers: { Allow: "POST" },
  });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!(await authorizeProRunner(request))) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const [monitoring, revenue] = await Promise.all([
    runDueProMonitoring({ limit: 10 }),
    fetchPartnerRevenueSummary().catch((error) => ({
      configured: true,
      createdAtMin: "2026-09-22T00:00:00Z",
      saleCount: 0,
      grossUsd: 0,
      netUsd: 0,
      nonUsdSaleCount: 0,
      latestCreatedAt: null,
      byType: {},
      error:
        error instanceof Error
          ? error.message
          : "Unknown Partner revenue lookup error.",
    })),
  ]);

  return Response.json(
    {
      ...monitoring,
      revenue,
    },
    {
      headers: { "cache-control": "no-store" },
    },
  );
};
