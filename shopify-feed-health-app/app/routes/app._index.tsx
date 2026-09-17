import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { scanCatalog } from "../lib/catalog-scan.server";
import { trackAppEvent } from "../lib/events.server";

async function runScan(request: Request) {
  const { admin } = await authenticate.admin(request);
  trackAppEvent("scan_started");
  const result = await scanCatalog(admin);
  trackAppEvent("scan_completed", {
    count: result.report.productsChecked,
    score: result.report.score,
  });
  return result;
}

export const loader = async ({ request }: LoaderFunctionArgs) => runScan(request);
export const action = async ({ request }: ActionFunctionArgs) => runScan(request);

export default function FeedHealthDashboard() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data || initial;
  const report = data.report;
  const loading = fetcher.state !== "idle";

  return (
    <s-page heading="Feed Health & Merchant Center Readiness">
      <s-button
        slot="primary-action"
        onClick={() => fetcher.submit({}, { method: "post" })}
        disabled={loading}
      >
        {loading ? "Scanning…" : "Rescan catalog"}
      </s-button>

      <s-section heading={`Readiness score: ${report.score}%`}>
        <s-stack direction="inline" gap="base">
          <s-badge tone={report.errors ? "critical" : "success"}>
            {report.errors} critical
          </s-badge>
          <s-badge tone={report.warnings ? "warning" : "success"}>
            {report.warnings} warnings
          </s-badge>
          <s-text>
            {report.productsChecked} products · {report.variantsChecked} variants · {report.imagesChecked} images
          </s-text>
        </s-stack>
        {data.productPaginationCapped ? (
          <s-banner tone="warning" heading="Large catalog scan capped">
            This MVP loaded the first 2,500 products. The production-scale path will use Shopify bulk operations.
          </s-banner>
        ) : null}
      </s-section>

      <s-section heading="Issues to fix">
        {report.issues.length === 0 ? (
          <s-banner tone="success" heading="No issues found by this scan">
            This is a readiness preflight, not a guarantee of Merchant Center approval.
          </s-banner>
        ) : (
          report.issues.slice(0, 100).map((entry: any, index: number) => (
            <s-box
              key={`${entry.code}-${entry.productId}-${index}`}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack>
                <s-stack direction="inline" gap="small">
                  <s-badge tone={entry.level === "error" ? "critical" : "warning"}>
                    {entry.code}
                  </s-badge>
                  <s-text type="strong">{entry.title}</s-text>
                </s-stack>
                <s-text>{entry.message}</s-text>
                <s-text tone="neutral">Remediation: {entry.remediation}</s-text>
              </s-stack>
            </s-box>
          ))
        )}
        {report.issues.length > 100 ? (
          <s-text tone="neutral">
            Showing the first 100 issues. Full export is a planned Pro/Agency capability.
          </s-text>
        ) : null}
      </s-section>

      <s-section heading="Why recurring monitoring matters">
        <s-paragraph>
          Catalog quality changes as products, variants, prices, images, and identifiers change. The planned Pro tier turns this scan into recurring feed-health monitoring and remediation guidance.
        </s-paragraph>
        <s-link href="/app/pricing">View planned tiers</s-link>
      </s-section>
    </s-page>
  );
}
