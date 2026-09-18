import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { getEntitlementForShop } from "./entitlements.server";
import { PRO_SCAN_LIMITS, scanCatalog } from "./catalog-scan.server";
import {
  generateScheduledReport,
  persistProScan,
} from "./pro-monitoring.server";

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function runDueProMonitoring(args: {
  now?: Date;
  limit?: number;
} = {}) {
  const now = args.now || new Date();
  const limit = Math.max(1, Math.min(args.limit || 10, 50));

  const due = await prisma.monitoringPreference.findMany({
    where: {
      enabled: true,
      nextScanAt: { lte: now },
    },
    orderBy: { nextScanAt: "asc" },
    take: limit,
  });

  const results: Array<{
    shop: string;
    status: "scanned" | "skipped" | "failed";
    score?: number;
    error?: string;
  }> = [];

  for (const preference of due) {
    try {
      const { admin } = await unauthenticated.admin(preference.shop);
      const entitlement = await getEntitlementForShop(preference.shop, admin);
      if (entitlement.plan !== "pro") {
        await prisma.monitoringPreference.update({
          where: { shop: preference.shop },
          data: { enabled: false, nextScanAt: null, nextReportAt: null },
        });
        results.push({
          shop: preference.shop,
          status: "skipped",
          error: "Pro entitlement is not active.",
        });
        continue;
      }

      await prisma.monitoringPreference.update({
        where: { shop: preference.shop },
        data: {
          nextScanAt: addHours(now, preference.intervalHours),
        },
      });

      const result = await scanCatalog(admin, PRO_SCAN_LIMITS);
      await persistProScan({
        shop: preference.shop,
        source: "scheduled",
        result,
      });

      const refreshed = await prisma.monitoringPreference.findUnique({
        where: { shop: preference.shop },
      });
      if (
        refreshed?.nextReportAt &&
        refreshed.nextReportAt.getTime() <= now.getTime()
      ) {
        await generateScheduledReport(preference.shop, now);
      }

      results.push({
        shop: preference.shop,
        status: "scanned",
        score: result.report.score,
      });
    } catch (error) {
      results.push({
        shop: preference.shop,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    checkedAt: now.toISOString(),
    dueCount: due.length,
    results,
  };
}
