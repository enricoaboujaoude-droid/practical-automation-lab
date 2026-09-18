import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getEntitlementForShop } from "../lib/entitlements.server";
import {
  historyCsv,
  scanIssuesCsv,
} from "../lib/pro-monitoring.server";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function scheduledReportCsv(report: {
  rangeStart: Date;
  rangeEnd: Date;
  generatedAt: Date;
  summaryJson: unknown;
}) {
  const summary =
    report.summaryJson && typeof report.summaryJson === "object"
      ? (report.summaryJson as Record<string, unknown>)
      : {};

  const rows: Array<[string, unknown]> = [
    ["generated_at", report.generatedAt.toISOString()],
    ["range_start", report.rangeStart.toISOString()],
    ["range_end", report.rangeEnd.toISOString()],
    ...Object.entries(summary),
  ];

  return ["metric,value", ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)].join("\n");
}

function download(body: string, filename: string) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop);

  if (entitlement.plan !== "pro") {
    return new Response("Pro entitlement required.", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "";

  if (type === "history") {
    const history = await prisma.catalogScan.findMany({
      where: { shop: session.shop },
      orderBy: { generatedAt: "desc" },
      take: 500,
      select: {
        generatedAt: true,
        source: true,
        score: true,
        errors: true,
        warnings: true,
        productsChecked: true,
        variantsChecked: true,
        imagesChecked: true,
        imageRisks: true,
      },
    });
    return download(historyCsv(history), "pal-catalog-check-history.csv");
  }

  if (type === "issues") {
    const scanId = url.searchParams.get("scanId") || "";
    const scan = await prisma.catalogScan.findFirst({
      where: { id: scanId, shop: session.shop },
      select: { reportJson: true, generatedAt: true },
    });

    if (!scan) return new Response("Scan not found.", { status: 404 });
    return download(
      scanIssuesCsv(scan.reportJson as any),
      `pal-catalog-check-findings-${scan.generatedAt.toISOString().slice(0, 10)}.csv`,
    );
  }

  if (type === "scheduled") {
    const reportId = url.searchParams.get("reportId") || "";
    const report = await prisma.scheduledReport.findFirst({
      where: { id: reportId, shop: session.shop },
    });

    if (!report) return new Response("Report not found.", { status: 404 });
    return download(
      scheduledReportCsv(report),
      `pal-catalog-check-report-${report.generatedAt.toISOString().slice(0, 10)}.csv`,
    );
  }

  return new Response("Unknown export type.", { status: 400 });
};
