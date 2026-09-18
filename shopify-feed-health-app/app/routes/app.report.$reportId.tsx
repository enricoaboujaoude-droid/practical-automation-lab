import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getEntitlementForShop } from "../lib/entitlements.server";

type Summary = {
  cadence?: string;
  scanCount?: number;
  firstScore?: number | null;
  latestScore?: number | null;
  scoreChange?: number | null;
  bestScore?: number | null;
  worstScore?: number | null;
  averageScore?: number | null;
  latestErrors?: number | null;
  latestWarnings?: number | null;
  latestImageRisks?: number | null;
  alertCount?: number;
};

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function value(value: unknown) {
  return value == null || value === "" ? "—" : String(value);
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop, admin);

  if (entitlement.plan !== "pro") {
    throw new Response("Pro entitlement required.", { status: 403 });
  }

  const reportId = String(params.reportId || "");
  const report = await prisma.scheduledReport.findFirst({
    where: { id: reportId, shop: session.shop },
  });

  if (!report) {
    throw new Response("Report not found.", { status: 404 });
  }

  return {
    report: {
      id: report.id,
      generatedAt: report.generatedAt,
      rangeStart: report.rangeStart,
      rangeEnd: report.rangeEnd,
      summary: (report.summaryJson || {}) as Summary,
    },
  };
};

export default function ScheduledReportView() {
  const { report } = useLoaderData<typeof loader>();
  const summary = report.summary;

  const rows: Array<[string, unknown]> = [
    ["Cadence", summary.cadence],
    ["Scans in report", summary.scanCount],
    ["First score", summary.firstScore == null ? null : `${summary.firstScore}%`],
    ["Latest score", summary.latestScore == null ? null : `${summary.latestScore}%`],
    ["Score change", summary.scoreChange],
    ["Best score", summary.bestScore == null ? null : `${summary.bestScore}%`],
    ["Worst score", summary.worstScore == null ? null : `${summary.worstScore}%`],
    ["Average score", summary.averageScore == null ? null : `${summary.averageScore}%`],
    ["Latest critical issues", summary.latestErrors],
    ["Latest warnings", summary.latestWarnings],
    ["Latest image risks", summary.latestImageRisks],
    ["Alerts in period", summary.alertCount],
  ];

  return (
    <s-page heading="Scheduled catalog report">
      <s-section heading="Report period">
        <s-paragraph>
          Generated {formatDate(report.generatedAt)}
        </s-paragraph>
        <s-paragraph>
          Coverage: {formatDate(report.rangeStart)} → {formatDate(report.rangeEnd)}
        </s-paragraph>
      </s-section>

      <s-section heading="Summary">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {rows.map(([label, raw]) => (
                <tr key={label}>
                  <th
                    align="left"
                    style={{
                      padding: "10px 12px 10px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    {label}
                  </th>
                  <td
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    {value(raw)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>

      <s-section heading="Export">
        <s-paragraph>
          The report is visible here for reliable mobile review. Use the CSV export when you want a spreadsheet copy.
        </s-paragraph>
        <p>
          <a
            href={`/app/export?type=scheduled&reportId=${encodeURIComponent(report.id)}`}
            target="_top"
            rel="noopener"
          >
            Download report CSV
          </a>
        </p>
        <p>
          <a href="/app/pro">Back to Monitoring & reports</a>
        </p>
      </s-section>
    </s-page>
  );
}
