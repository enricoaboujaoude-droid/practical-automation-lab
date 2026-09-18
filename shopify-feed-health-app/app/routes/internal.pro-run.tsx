import { timingSafeEqual } from "node:crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { runDueProMonitoring } from "../lib/pro-monitoring-runner.server";

function authorized(request: Request) {
  const expected = String(process.env.PAL_PRO_CRON_SECRET || "");
  if (!expected) return false;

  const supplied = String(request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    "",
  );

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response("Method not allowed.", {
    status: 405,
    headers: { Allow: "POST" },
  });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!authorized(request)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const result = await runDueProMonitoring({ limit: 10 });
  return Response.json(result, {
    headers: { "cache-control": "no-store" },
  });
};
