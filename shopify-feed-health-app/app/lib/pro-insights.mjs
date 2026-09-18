export function imageRiskCount(report) {
  return Number(report?.imageReadiness?.productsMissingImages || 0)
    + Number(report?.imageReadiness?.imagesBelow500 || 0);
}

function issueFingerprint(entry) {
  return [
    entry?.level || "",
    entry?.code || "",
    entry?.productId || "",
    entry?.message || "",
  ].join("|");
}

export function diffReports(previous, current) {
  if (!previous) {
    return {
      scoreDelta: 0,
      errorDelta: 0,
      warningDelta: 0,
      imageRiskDelta: 0,
      newIssues: current?.issues || [],
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
    scoreDelta: Number(current.score || 0) - Number(previous.score || 0),
    errorDelta: Number(current.errors || 0) - Number(previous.errors || 0),
    warningDelta: Number(current.warnings || 0) - Number(previous.warnings || 0),
    imageRiskDelta: imageRiskCount(current) - imageRiskCount(previous),
    newIssues: (current.issues || []).filter(
      (entry) => !previousMap.has(issueFingerprint(entry)),
    ),
    resolvedIssues: (previous.issues || []).filter(
      (entry) => !currentMap.has(issueFingerprint(entry)),
    ),
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function scanIssuesCsv(report) {
  const header = [
    "level",
    "code",
    "product_id",
    "title",
    "message",
    "remediation",
  ];
  const rows = (report?.issues || []).map((entry) => [
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

export function historyCsv(history) {
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
    new Date(scan.generatedAt).toISOString(),
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
