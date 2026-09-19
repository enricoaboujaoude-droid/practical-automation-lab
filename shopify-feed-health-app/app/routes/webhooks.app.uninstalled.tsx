import type { ActionFunctionArgs } from "react-router";
import db from "../db.server";
import { authenticateWebhookSafely } from "../lib/authenticate-webhook-safe.server";

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
  const { shop, topic, usedFallback } =
    await authenticateWebhookSafely(request);

  await deleteShopData(shop);

  console.log(
    `PAL_SHOPIFY_EVENT event=app_uninstalled topic=${topic || "unknown"} fallback=${usedFallback}`,
  );

  return new Response(null, { status: 200 });
};
