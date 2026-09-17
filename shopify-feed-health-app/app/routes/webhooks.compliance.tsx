import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const topic = request.headers.get("x-shopify-topic")?.toLowerCase() ?? "";

  if (topic === "shop/redact") {
    await db.session.deleteMany({ where: { shop } });
  }

  console.log(`PAL_SHOPIFY_EVENT event=compliance_webhook topic=${topic || "unknown"}`);
  return new Response(null, { status: 204 });
};
