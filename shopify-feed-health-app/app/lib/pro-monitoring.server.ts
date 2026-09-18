import prisma from "../db.server";

type IssueLike = {
  level?: string;
  code?: string;
  productId?: string;
  title?: string;
  message?: string;
  remediation?: string;
};

type ReportLike = {
  generatedAt: string;
  productsChecked: number;
  variantsChecked: number;
  imagesChecked: number;
  errors: number;
  warnings: number;
  score: number;
  imageReadiness?: {
    productsMissingImages?: number;
    imagesBelow500?: number;
    productsWithImageRisk?: number;
    readyImages?: number;
    readyPercent?: number;
    enforcementDate?: string;
  };
  issues: IssueLike[];
};

type ScanResultLike = {
  report: ReportLike;
  productPaginationCapped: boolean;
};

const ALLOWED_INTERVALS = new Set([6, 12, 24, 48, 168]);
const ALLOWED_CADENCES = new Set(["daily", "weekly", "monthly"]);

function imageRiskCount(report: ReportLike | null | undefined) {
  return Number(report?.imageReadiness?.productsMissingImages || 0)
    + Number(report?.imageReadiness?.imagesBelow500 || 0);
}

function issueFingerprint(entry: IssueLike) {
  return [
    entry.level || "",
    entry.code || "",
    entry.productId || "",
    entry.message || "",
  ].join("|");
}

export function diffReports(
  previous: ReportLike | null | undefined,
  current: ReportLike,
) {
  if (!previous) {
    return {
      scoreDelta: 0,
      errorDelta: 0,
      warningDelta: 0,
      imageRiskDelta: 0,
      newIssues: current.issues,
      resolvedIssues: [],
    };
  }

  const previousMap = new Map(
    (previous.issues || []).map((entry) => [issueFingerprint(entry), entry]),
  );
  const currentMap = new Map(
    (current.issues || []).map((entry) => [issueFingerprint(entry), entry]),
  );

  return {
    scoreDelta: current.score - previous.score,
    errorDelta: current.errors - previous.errors,
    warningDelta: current.warnings - previous.warnings,
    imageRiskDelta: imageRiskCount(current) - imageRiskCount(previous),
    newIssues: (current.issues || []).filter(
      (entry) => !previousMap.has(issueFingerprint(entry)),
    ),
    resolvedIssues: (previous.issues || []).filter(
      (entry) => !currentMap.has(issueFingerprint(entry)),
    ),
  };
}

function alertsForDiff(scanId: string, diff: ReturnType<typeof diffReports>) {
  const alerts: Array<{
    scanId: string;
    kind: string;
    severity: string;
    title: string;
    message: string;
  }> = [];

  if (diff.scoreDelta <= -5) {
    alerts.push({
      scanId,
      kind: "health_drop",
      severity: diff.scoreDelta <= -15 ? "critical" : "warning",
      title: "Catalog readiness score dropped",
      message: `Readiness score fell by ${Math.abs(diff.scoreDelta)} points since the previous saved scan.`,
    });
  }

  if (diff.errorDelta > 0) {
    alerts.push({
      scanId,
      kind: "critical_issues_increased",
      severity: "critical",
      title: "New critical catalog issues detected",
      message: `Critical issue count increased by ${diff.errorDelta}.`,
    });
  }

  if (diff.imageRiskDelta > 0) {
    alerts.push({
      scanId,
      kind: "image_readiness_worsened",
      severity: "warning",
      title: "2027 image readiness worsened",
      message: `Image-readiness risk count increased by ${diff.imageRiskDelta}.`,
    });
  }

  return alerts;
}

export async function persistProScan(args: {
  shop: string;
  source: "manual" | "scheduled";
  result: ScanResultLike;
}) {
  const previous = await prisma.catalogScan.findFirst({
    where: { shop: args.shop },
    orderBy: { createdAt: "desc" },
  });

  const scan = await prisma.catalogScan.create({
    data: {
      shop: args.shop,
      source: args.source,
      plan: "pro",
      generatedAt: new Date(args.result.report.generatedAt),
      score: args.result.report.score,
      errors: args.result.report.errors,
      warnings: args.result.report.warnings,
      productsChecked: args.result.report.productsChecked,
      variantsChecked: args.result.report.variantsChecked,
      imagesChecked: args.result.report.imagesChecked,
      imageRisks: imageRiskCount(args.result.report),
      productPaginationCapped: args.result.productPaginationCapped,
      reportJson: args.result.report as any,
    },
  });

  const previousReport = previous?.reportJson as unknown as ReportLike | undefined;
  const diff = diffReports(previousReport, args.result.report);
  const alerts = alertsForDiff(scan.id, diff);

  if (alerts.length) {
    await prisma.catalogAlert.createMany({
      data: alerts.map((entry) => ({
        shop: args.shop,
        ...entry,
      })),
    });
  }

  await prisma.monitoringPreference.upsert({
    where: { shop: args.shop },
    update: { lastScanAt: scan.generatedAt },
    create: {
      shop: args.shop,
      lastScanAt: scan.generatedAt,
    },
  });

  return { scan, diff, alerts };
}

export async function getProDashboard(shop: string) {
  const [history, alerts, preferences, reports] = await Promise.all([
    prisma.catalogScan.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        source: true,
        score: true,
        errors: true,
        warnings: true,
        productsChecked: true,
        variantsChecked: true,
        imagesChecked: true,
        imageRisks: true,
        productPaginationCapped: true,
        generatedAt: true,
      },
    }),
    prisma.catalogAlert.findMany({
      where: { shop },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.monitoringPreference.findUnique({ where: { shop } }),
    prisma.scheduledReport.findMany({
      where: { shop },
      orderBy: { generatedAt: "desc" },
      take: 12,
    }),
  ]);

  return {
    history,
    alerts,
    preferences: preferences || {
      shop,
      enabled: false,
      intervalHours: 24,
      reportCadence: "weekly",
      nextScanAt: null,
      lastScanAt: null,
      nextReportAt: null,
    },
    reports,
  };
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function nextReportAt(cadence: string, from = new Date()) {
  if (cadence === "daily") return addHours(from, 24);
  if (cadence === "monthly") return addHours(from, 24 * 30);
  return addHours(from, 24 * 7);
}

export async function updateMonitoringPreference(args: {
  shop: string;
  enabled: boolean;
  intervalHours: number;
  reportCadence: string;
}) {
  const intervalHours = ALLOWED_INTERVALS.has(args.intervalHours)
    ? args.intervalHours
    : 24;
  const reportCadence = ALLOWED_CADENCES.has(args.reportCadence)
    ? args.reportCadence
    : "weekly";
  const now = new Date();

  return prisma.monitoringPreference.upsert({
    where: { shop: args.shop },
    update: {
      enabled: args.enabled,
      intervalHours,
      reportCadence,
      nextScanAt: args.enabled ? addHours(now, intervalHours) : null,
      nextReportAt: args.enabled ? nextReportAt(reportCadence, now) : null,
    },
    create: {
      shop: args.shop,
      enabled: args.enabled,
      intervalHours,
      reportCadence,
      nextScanAt: args.enabled ? addHours(now, intervalHours) : null,
      nextReportAt: args.enabled ? nextReportAt(reportCadence, now) : null,
    },
  });
}

export async function acknowledgeAlert(shop: string, alertId: string) {
  return prisma.catalogAlert.updateMany({
    where: { id: alertId, shop },
    data: { acknowledgedAt: new Date() },
  });
}

export async function generateScheduledReport(
  shop: string,
  generatedAt = new Date(),
) {
  const preferences = await prisma.monitoringPreference.findUnique({
    where: { shop },
  });
  const cadence = preferences?.reportCadence || "weekly";
  const rangeHours =
    cadence === "daily" ? 24 : cadence === "monthly" ? 24 * 30 : 24 * 7;
  const rangeStart = addHours(generatedAt, -rangeHours);

  const scans = await prisma.catalogScan.findMany({
    where: {
      shop,
      generatedAt: { gte: rangeStart, lte: generatedAt },
    },
    orderBy: { generatedAt: "asc" },
  });

  const alerts = await prisma.catalogAlert.count({
    where: {
      shop,
      createdAt: { gte: rangeStart, lte: generatedAt },
    },
  });

  const first = scans[0];
  const latest = scans.at(-1);
  const summary = {
    cadence,
    scanCount: scans.length,
    firstScore: first?.score ?? null,
    latestScore: latest?.score ?? null,
    scoreChange:
      first && latest ? latest.score - first.score : null,
    bestScore: scans.length ? Math.max(...scans.map((scan) => scan.score)) : null,
    worstScore: scans.length ? Math.min(...scans.map((scan) => scan.score)) : null,
    averageScore: scans.length
      ? Math.round(
          scans.reduce((total, scan) => total + scan.score, 0) / scans.length,
        )
      : null,
    latestErrors: latest?.errors ?? null,
    latestWarnings: latest?.warnings ?? null,
    latestImageRisks: latest?.imageRisks ?? null,
    alertCount: alerts,
  };

  const report = await prisma.scheduledReport.create({
    data: {
      shop,
      rangeStart,
      rangeEnd: generatedAt,
      summaryJson: summary as any,
    },
  });

  await prisma.monitoringPreference.upsert({
    where: { shop },
    update: { nextReportAt: nextReportAt(cadence, generatedAt) },
    create: {
      shop,
      reportCadence: cadence,
      nextReportAt: nextReportAt(cadence, generatedAt),
    },
  });

  return report;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function scanIssuesCsv(report: ReportLike) {
  const header = [
    "level",
    "code",
    "product_id",
    "title",
    "message",
    "remediation",
  ];
  const rows = (report.issues || []).map((entry) => [
    entry.level,
    entry.code,
    entry.productId,
    entry.title,
    entry.message,
    entry.remediation,
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

export function historyCsv(
  history: Array<{
    generatedAt: Date;
    source: string;
    score: number;
    errors: number;
    warnings: number;
    productsChecked: number;
    variantsChecked: number;
    imagesChecked: number;
    imageRisks: number;
  }>,
) {
  const header = [
    "generated_at",
    "source",
    "score",
    "errors",
    "warnings",
    "products_checked",
    "variants_checked",
    "images_checked",
    "image_risks",
  ];
  const rows = history.map((scan) => [
    scan.generatedAt.toISOString(),
    scan.source,
    scan.score,
    scan.errors,
    scan.warnings,
    scan.productsChecked,
    scan.variantsChecked,
    scan.imagesChecked,
    scan.imageRisks,
  ]);

  return [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}
