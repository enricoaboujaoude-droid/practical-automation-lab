import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  const [
    sessionRows,
    distinctScannedShops,
    totalScans,
    freeScans,
    proScans,
    proShopRows,
    monitoringEnabled,
    monitoringRows,
    lastScan,
  ] = await Promise.all([
    prisma.session.findMany({
      where: { isOnline: false },
      select: { shop: true },
      distinct: ["shop"],
    }),
    prisma.catalogScan.findMany({
      select: { shop: true },
      distinct: ["shop"],
    }),
    prisma.catalogScan.count(),
    prisma.catalogScan.count({ where: { plan: "free" } }),
    prisma.catalogScan.count({ where: { plan: "pro" } }),
    prisma.catalogScan.findMany({
      where: { plan: "pro" },
      select: { shop: true },
      distinct: ["shop"],
    }),
    prisma.monitoringPreference.count({ where: { enabled: true } }),
    prisma.monitoringPreference.count(),
    prisma.catalogScan.findFirst({
      orderBy: { generatedAt: "desc" },
      select: { generatedAt: true, plan: true, source: true },
    }),
  ]);

  const activeInstalledShops = sessionRows.length;
  const scannedShops = distinctScannedShops.length;
  const proShopsSeen = proShopRows.length;

  return Response.json(
    {
      ok: true,
      scope: "aggregate_only",
      active_installed_shops: activeInstalledShops,
      shops_with_scans: scannedShops,
      shops_without_scans: Math.max(0, activeInstalledShops - scannedShops),
      total_scans: totalScans,
      free_scans: freeScans,
      pro_scans: proScans,
      pro_shops_seen: proShopsSeen,
      monitoring_preferences: monitoringRows,
      monitoring_enabled: monitoringEnabled,
      latest_scan: lastScan
        ? {
            generated_at: lastScan.generatedAt,
            plan: lastScan.plan,
            source: lastScan.source,
          }
        : null,
      funnel: {
        install_to_scan_pct:
          activeInstalledShops > 0
            ? Number(((scannedShops / activeInstalledShops) * 100).toFixed(1))
            : null,
        scanned_shop_to_pro_seen_pct:
          scannedShops > 0
            ? Number(((proShopsSeen / scannedShops) * 100).toFixed(1))
            : null,
      },
      generated_at: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};

export default function MetricsRoute() {
  return null;
}
