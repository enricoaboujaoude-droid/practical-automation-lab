import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

async function deleteShopData(shop: string) {
  await db.$transaction([
    db.catalogAlert.deleteMany({ where: { shop } }),
    db.scheduledReport.deleteMany({ where: { shop } }),
    db.catalogScan.deleteMany({ where: { shop } }),
    db.monitoringPreference.deleteMany({ where: { shop } }),
    db.session.deleteMany({ where: { shop } }),
  ]);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);
  const topic = request.headers.get("x-shopify-topic")?.toLowerCase() ?? "";

  if (topic === "shop/redact") {
    await deleteShopData(shop);
  }

  console.log(`PAL_SHOPIFY_EVENT event=compliance_webhook topic=${topic || "unknown"}`);
  return new Response(null, { status: 204 });
};
