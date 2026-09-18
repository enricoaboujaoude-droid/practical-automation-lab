import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authorizeProRunner } from "../lib/pro-run-auth.server";
import { runDueProMonitoring } from "../lib/pro-monitoring-runner.server";

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response("Method not allowed.", {
    status: 405,
    headers: { Allow: "POST" },
  });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!(await authorizeProRunner(request))) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const result = await runDueProMonitoring({ limit: 10 });
  return Response.json(result, {
    headers: { "cache-control": "no-store" },
  });
};
