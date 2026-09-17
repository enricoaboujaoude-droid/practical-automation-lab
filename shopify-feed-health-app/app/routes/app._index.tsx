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

export default function CatalogCheckDashboard() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data || initial;
  const report = data.report;
  const loading = fetcher.state !== "idle";

  return (
    <s-page heading="Catalog readiness check">
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
          <s-banner tone="warning" heading="Catalog scan limit reached">
            This scan checks up to 2,500 products. Results shown here cover the first 2,500 products returned in Shopify product-ID order.
          </s-banner>
        ) : null}
      </s-section>

      <s-section heading="Issues to review">
        {report.issues.length === 0 ? (
          <s-banner tone="success" heading="No issues found by this scan">
            This is a catalog-readiness check, not a guarantee of approval by Google Merchant Center or any other sales channel.
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
          <s-text tone="neutral">Showing the first 100 findings from this scan.</s-text>
        ) : null}
      </s-section>

      <s-section heading="Checks included">
        <s-paragraph>
          The scan reviews product titles, vendor/brand presence, Online Store URLs, product images, image dimensions when Shopify provides them, variant identifiers, prices, and duplicate option combinations.
        </s-paragraph>
        <s-paragraph>
          The app requests read-only product access and does not edit products or variants.
        </s-paragraph>
        <s-link href="/app/support">Support and data handling</s-link>
      </s-section>
    </s-page>
  );
}
