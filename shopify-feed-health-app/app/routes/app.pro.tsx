import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useFetcher, useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getEntitlementForShop } from "../lib/entitlements.server";
import { trackAppEvent } from "../lib/events.server";
import { getPlanSelectionUrl } from "../lib/billing-links.server";
import {
  acknowledgeAlert,
  generateScheduledReport,
  getProDashboard,
  historyCsv,
  scanIssuesCsv,
  updateMonitoringPreference,
} from "../lib/pro-monitoring.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop, admin);

  return {
    entitlement,
    planSelectionUrl: getPlanSelectionUrl(session.shop),
    dashboard:
      entitlement.plan === "pro"
        ? await getProDashboard(session.shop)
        : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop, admin);

  if (entitlement.plan !== "pro") {
    return {
      ok: false,
      message:
        "Pro is not active for this shop yet. Billing will remain disabled until Shopify App Pricing is configured and tested.",
      export: null,
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "export-csv") {
    const exportType = String(formData.get("exportType") || "");

    if (exportType === "history") {
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
      trackAppEvent("pro_export_downloaded", { count: history.length });
      return {
        ok: true,
        message: "History CSV prepared.",
        export: {
          filename: "pal-catalog-check-history.csv",
          body: historyCsv(history),
        },
      };
    }

    if (exportType === "issues") {
      const scanId = String(formData.get("scanId") || "");
      const scan = await prisma.catalogScan.findFirst({
        where: { id: scanId, shop: session.shop },
        select: { reportJson: true, generatedAt: true },
      });

      if (!scan) {
        return {
          ok: false,
          message: "The selected scan could not be found.",
          export: null,
        };
      }

      trackAppEvent("pro_export_downloaded");
      return {
        ok: true,
        message: "Findings CSV prepared.",
        export: {
          filename: `pal-catalog-check-findings-${scan.generatedAt
            .toISOString()
            .slice(0, 10)}.csv`,
          body: scanIssuesCsv(scan.reportJson as any),
        },
      };
    }

    if (exportType === "scheduled") {
      const reportId = String(formData.get("reportId") || "");
      const report = await prisma.scheduledReport.findFirst({
        where: { id: reportId, shop: session.shop },
      });

      if (!report) {
        return {
          ok: false,
          message: "The selected scheduled report could not be found.",
          export: null,
        };
      }

      trackAppEvent("pro_export_downloaded");
      return {
        ok: true,
        message: "Scheduled report CSV prepared.",
        export: {
          filename: `pal-catalog-check-report-${report.generatedAt
            .toISOString()
            .slice(0, 10)}.csv`,
          body: scheduledReportCsv(report),
        },
      };
    }

    return {
      ok: false,
      message: "Unknown export type.",
      export: null,
    };
  }

  if (intent === "monitoring") {
    const enabled = formData.get("enabled") === "on";
    const intervalHours = Number(formData.get("intervalHours") || 24);
    const reportCadence = String(formData.get("reportCadence") || "weekly");

    await updateMonitoringPreference({
      shop: session.shop,
      enabled,
      intervalHours,
      reportCadence,
    });
    trackAppEvent(enabled ? "pro_monitoring_enabled" : "pro_monitoring_disabled", {
      intervalHours,
    });

    return {
      ok: true,
      message: enabled
        ? "Automatic monitoring schedule saved."
        : "Automatic monitoring paused.",
      export: null,
    };
  }

  if (intent === "acknowledge") {
    const alertId = String(formData.get("alertId") || "");
    if (alertId) await acknowledgeAlert(session.shop, alertId);
    return { ok: true, message: "Alert acknowledged.", export: null };
  }

  if (intent === "generate-report") {
    await generateScheduledReport(session.shop);
    trackAppEvent("pro_report_generated");
    return {
      ok: true,
      message: "A report snapshot was generated.",
      export: null,
    };
  }

  return { ok: false, message: "Unknown action.", export: null };
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

function reportSummary(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function displayMetric(value: unknown, suffix = "") {
  if (value == null || value === "") return "—";
  return `${String(value)}${suffix}`;
}

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

  return [
    "metric,value",
    ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`),
  ].join("\n");
}

function triggerCsvDownload(payload: { filename: string; body: string }) {
  const blob = new Blob(["\uFEFF", payload.body], {
    type: "text/csv;charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = payload.filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

export default function ProMonitoringDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const exportFetcher = useFetcher<typeof action>();
  const exportPayload = exportFetcher.data?.export;

  useEffect(() => {
    if (!exportPayload) return;
    triggerCsvDownload(exportPayload);
  }, [exportPayload]);

  if (data.entitlement.plan !== "pro" || !data.dashboard) {
    return (
      <s-page heading="Monitoring & reports">
        <s-banner tone="info" heading="Pro capability is installed but not activated">
          The Pro feature layer is being built before launch. This shop remains on the Free entitlement until Shopify App Pricing is configured or the shop is explicitly enabled for development preview.
        </s-banner>
        <s-section heading="Pro capabilities">
          <s-paragraph>
            Automatic recurring scans, saved history, change detection, health-drop alerts, 2027 image-readiness monitoring, higher scan limits, exportable remediation reports, and scheduled reports are implemented behind the Pro entitlement boundary.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const { history, alerts, preferences, reports } = data.dashboard;
  const openAlerts = alerts.filter((alert) => !alert.acknowledgedAt);

  return (
    <s-page heading="Monitoring & reports">
      <div className="pal-intro">
        <div>
          <div className="pal-eyebrow">Pro workspace</div>
          <p className="pal-subtitle">
            Automate catalog checks, keep a saved history, track changes, and
            export scheduled readiness reports without editing Shopify data.
          </p>
        </div>
        <div className="pal-status-row">
          <s-badge tone="success">Pro active</s-badge>
          <s-badge tone={preferences.enabled ? "success" : "info"}>
            {preferences.enabled ? "Monitoring on" : "Monitoring paused"}
          </s-badge>
        </div>
      </div>
      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "warning"} heading={actionData.ok ? "Updated" : "Not changed"}>
          {actionData.message}
        </s-banner>
      ) : null}

      {exportFetcher.data?.message ? (
        <s-banner
          tone={exportFetcher.data.ok ? "success" : "warning"}
          heading={exportFetcher.data.ok ? "CSV export ready" : "CSV export failed"}
        >
          {exportFetcher.data.message}
          {exportPayload ? (
            <>
              {" "}
              <button
                type="button"
                className="pal-link-button"
                onClick={() => triggerCsvDownload(exportPayload)}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                Download again
              </button>
            </>
          ) : null}
        </s-banner>
      ) : null}

      <s-section heading="Automatic monitoring">
        <Form method="post">
          <input type="hidden" name="intent" value="monitoring" />
          <div className="pal-form-grid">
            <div className="pal-field">
              <span className="pal-field-label">Recurring scans</span>
              <label className="pal-checkline">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={preferences.enabled}
                />
                Enable monitoring
              </label>
            </div>

            <label className="pal-field">
              <span className="pal-field-label">Scan interval</span>
              <select
                className="pal-control"
                name="intervalHours"
                defaultValue={String(preferences.intervalHours)}
              >
                <option value="6">Every 6 hours</option>
                <option value="12">Every 12 hours</option>
                <option value="24">Daily</option>
                <option value="48">Every 2 days</option>
                <option value="168">Weekly</option>
              </select>
            </label>

            <label className="pal-field">
              <span className="pal-field-label">Report cadence</span>
              <select
                className="pal-control"
                name="reportCadence"
                defaultValue={preferences.reportCadence}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>

            <button className="pal-button pal-button-primary" type="submit">
              Save schedule
            </button>
          </div>
        </Form>

        <div className="pal-meta-strip">
          Last saved scan: {formatDate(preferences.lastScanAt)} · Next automatic
          scan: {formatDate(preferences.nextScanAt)} · Next report:{" "}
          {formatDate(preferences.nextReportAt)}
        </div>
      </s-section>

      <s-section heading="Health alerts">
        {openAlerts.length === 0 ? (
          <s-banner tone="success" heading="No open health alerts">
            Pro will create alerts when readiness falls, critical issues increase, or 2027 image-readiness risk worsens.
          </s-banner>
        ) : (
          openAlerts.map((alert) => (
            <div key={alert.id} className="pal-issue-card">
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
              <small>{formatDate(alert.createdAt)}</small>
              <Form method="post">
                <input type="hidden" name="intent" value="acknowledge" />
                <input type="hidden" name="alertId" value={alert.id} />
                <button className="pal-button" type="submit">Acknowledge</button>
              </Form>
            </div>
          ))
        )}
      </s-section>

      <s-section heading="Saved scan history">
        <div className="pal-actions-row" style={{ marginBottom: 12 }}>
          <exportFetcher.Form method="post">
            <input type="hidden" name="intent" value="export-csv" />
            <input type="hidden" name="exportType" value="history" />
            <button
              className="pal-button"
              type="submit"
              disabled={exportFetcher.state !== "idle"}
            >
              {exportFetcher.state !== "idle"
                ? "Preparing CSV…"
                : "Download history CSV"}
            </button>
          </exportFetcher.Form>
        </div>
        {history.length === 0 ? (
          <div className="pal-empty">No saved Pro scans yet.</div>
        ) : (
          <div className="pal-table-wrap">
            <table className="pal-table">
              <thead>
                <tr>
                  <th align="left">Time</th>
                  <th align="left">Source</th>
                  <th align="right">Score</th>
                  <th align="right">Critical</th>
                  <th align="right">Warnings</th>
                  <th align="right">Image risks</th>
                  <th align="left">Export</th>
                </tr>
              </thead>
              <tbody>
                {history.map((scan) => (
                  <tr key={scan.id}>
                    <td>{formatDate(scan.generatedAt)}</td>
                    <td>{scan.source}</td>
                    <td align="right">{scan.score}%</td>
                    <td align="right">{scan.errors}</td>
                    <td align="right">{scan.warnings}</td>
                    <td align="right">{scan.imageRisks}</td>
                    <td>
                      <exportFetcher.Form method="post">
                        <input type="hidden" name="intent" value="export-csv" />
                        <input type="hidden" name="exportType" value="issues" />
                        <input type="hidden" name="scanId" value={scan.id} />
                        <button
                          type="submit"
                          className="pal-link-button"
                          disabled={exportFetcher.state !== "idle"}
                          style={{
                            border: 0,
                            background: "transparent",
                            padding: 0,
                            cursor:
                              exportFetcher.state === "idle"
                                ? "pointer"
                                : "wait",
                            font: "inherit",
                          }}
                        >
                          Findings CSV
                        </button>
                      </exportFetcher.Form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      <s-section heading="Scheduled reports">
        <Form method="post">
          <input type="hidden" name="intent" value="generate-report" />
          <button className="pal-button" type="submit">Generate report now</button>
        </Form>
        {reports.length === 0 ? (
          <div className="pal-empty" style={{ marginTop: 12 }}>
            No scheduled report snapshots yet.
          </div>
        ) : (
          <div>
            {reports.map((report) => {
              const summary = reportSummary(report.summaryJson);
              return (
                <details key={report.id} className="pal-report-card">
                  <summary>
                    {formatDate(report.generatedAt)} · View report
                  </summary>
                  <div className="pal-report-body">
                    <p className="pal-subtitle">
                      Coverage: {formatDate(report.rangeStart)} → {formatDate(report.rangeEnd)}
                    </p>
                    <div className="pal-table-wrap">
                    <table className="pal-table">
                      <tbody>
                        {[
                          ["Cadence", displayMetric(summary.cadence)],
                          ["Scans in report", displayMetric(summary.scanCount)],
                          ["First score", displayMetric(summary.firstScore, "%")],
                          ["Latest score", displayMetric(summary.latestScore, "%")],
                          ["Score change", displayMetric(summary.scoreChange)],
                          ["Best score", displayMetric(summary.bestScore, "%")],
                          ["Worst score", displayMetric(summary.worstScore, "%")],
                          ["Average score", displayMetric(summary.averageScore, "%")],
                          ["Latest critical issues", displayMetric(summary.latestErrors)],
                          ["Latest warnings", displayMetric(summary.latestWarnings)],
                          ["Latest image risks", displayMetric(summary.latestImageRisks)],
                          ["Alerts in period", displayMetric(summary.alertCount)],
                        ].map(([label, metric]) => (
                          <tr key={label}>
                            <th
                              align="left"
                              style={{
                                padding: "8px 12px 8px 0",
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              {label}
                            </th>
                            <td
                              style={{
                                padding: "8px 0",
                                borderBottom: "1px solid #eee",
                              }}
                            >
                              {metric}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <exportFetcher.Form method="post">
                        <input type="hidden" name="intent" value="export-csv" />
                        <input type="hidden" name="exportType" value="scheduled" />
                        <input type="hidden" name="reportId" value={report.id} />
                        <button
                          type="submit"
                          className="pal-button"
                          disabled={exportFetcher.state !== "idle"}
                        >
                          Download CSV
                        </button>
                      </exportFetcher.Form>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </s-section>

      <s-section heading="Pro capacity">
        <s-paragraph>
          Pro scans support up to {data.entitlement.limits.maxProducts.toLocaleString()} products, {data.entitlement.limits.variantLimit} variants per product, and {data.entitlement.limits.imageLimit} images per product in the current bounded scan design.
        </s-paragraph>
        <s-paragraph>
          PAL remains read-only. Monitoring, history, alerts, and reports never edit products or variants.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
