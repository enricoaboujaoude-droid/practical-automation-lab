import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getEntitlementForShop } from "../lib/entitlements.server";
import { trackAppEvent } from "../lib/events.server";
import {
  acknowledgeAlert,
  generateScheduledReport,
  getProDashboard,
  updateMonitoringPreference,
} from "../lib/pro-monitoring.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop);

  return {
    entitlement,
    dashboard:
      entitlement.plan === "pro"
        ? await getProDashboard(session.shop)
        : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop);

  if (entitlement.plan !== "pro") {
    return {
      ok: false,
      message:
        "Pro is not active for this shop yet. Billing will remain disabled until Shopify App Pricing is configured and tested.",
    };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

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
    };
  }

  if (intent === "acknowledge") {
    const alertId = String(formData.get("alertId") || "");
    if (alertId) await acknowledgeAlert(session.shop, alertId);
    return { ok: true, message: "Alert acknowledged." };
  }

  if (intent === "generate-report") {
    await generateScheduledReport(session.shop);
    trackAppEvent("pro_report_generated");
    return { ok: true, message: "A report snapshot was generated." };
  }

  return { ok: false, message: "Unknown action." };
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString();
}

export default function ProMonitoringDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
    <s-page heading="Pro monitoring & reports">
      {actionData?.message ? (
        <s-banner tone={actionData.ok ? "success" : "warning"} heading={actionData.ok ? "Updated" : "Not changed"}>
          {actionData.message}
        </s-banner>
      ) : null}

      <s-section heading="Automatic monitoring">
        <Form method="post">
          <input type="hidden" name="intent" value="monitoring" />
          <label style={{ display: "block", marginBottom: 12 }}>
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={preferences.enabled}
            />{" "}
            Enable recurring catalog scans
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            Scan interval{" "}
            <select name="intervalHours" defaultValue={String(preferences.intervalHours)}>
              <option value="6">Every 6 hours</option>
              <option value="12">Every 12 hours</option>
              <option value="24">Daily</option>
              <option value="48">Every 2 days</option>
              <option value="168">Weekly</option>
            </select>
          </label>
          <label style={{ display: "block", marginBottom: 12 }}>
            Scheduled report cadence{" "}
            <select name="reportCadence" defaultValue={preferences.reportCadence}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <button type="submit">Save monitoring schedule</button>
        </Form>
        <p>
          Last saved scan: {formatDate(preferences.lastScanAt)} · Next automatic scan: {formatDate(preferences.nextScanAt)} · Next report: {formatDate(preferences.nextReportAt)}
        </p>
      </s-section>

      <s-section heading="Health alerts">
        {openAlerts.length === 0 ? (
          <s-banner tone="success" heading="No open health alerts">
            Pro will create alerts when readiness falls, critical issues increase, or 2027 image-readiness risk worsens.
          </s-banner>
        ) : (
          openAlerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 14,
                marginBottom: 10,
              }}
            >
              <strong>{alert.title}</strong>
              <p>{alert.message}</p>
              <small>{formatDate(alert.createdAt)}</small>
              <Form method="post">
                <input type="hidden" name="intent" value="acknowledge" />
                <input type="hidden" name="alertId" value={alert.id} />
                <button type="submit">Acknowledge</button>
              </Form>
            </div>
          ))
        )}
      </s-section>

      <s-section heading="Saved scan history">
        <p>
          <a href="/app/export?type=history">Download history CSV</a>
        </p>
        {history.length === 0 ? (
          <p>No saved Pro scans yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                      <a href={`/app/export?type=issues&scanId=${encodeURIComponent(scan.id)}`}>
                        Findings CSV
                      </a>
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
          <button type="submit">Generate report now</button>
        </Form>
        {reports.length === 0 ? (
          <p>No scheduled report snapshots yet.</p>
        ) : (
          <ul>
            {reports.map((report) => (
              <li key={report.id}>
                {formatDate(report.generatedAt)} ·{" "}
                <a href={`/app/export?type=scheduled&reportId=${encodeURIComponent(report.id)}`}>
                  Download report CSV
                </a>
              </li>
            ))}
          </ul>
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
