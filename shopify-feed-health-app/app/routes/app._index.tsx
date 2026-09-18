import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { scanCatalog } from "../lib/catalog-scan.server";
import { getEntitlementForShop } from "../lib/entitlements.server";
import { persistProScan } from "../lib/pro-monitoring.server";
import { trackAppEvent } from "../lib/events.server";
import { getPlanSelectionUrl } from "../lib/billing-links.server";

async function runScan(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop, admin);

  trackAppEvent("scan_started");
  const result = await scanCatalog(admin, entitlement.limits);
  const saved =
    entitlement.plan === "pro"
      ? await persistProScan({
          shop: session.shop,
          source: "manual",
          result,
        })
      : null;

  trackAppEvent("scan_completed", {
    count: result.report.productsChecked,
    score: result.report.score,
  });

  return {
    ...result,
    entitlement,
    planSelectionUrl: getPlanSelectionUrl(session.shop),
    changeSummary: saved
      ? {
          scoreDelta: saved.diff.scoreDelta,
          errorDelta: saved.diff.errorDelta,
          warningDelta: saved.diff.warningDelta,
          imageRiskDelta: saved.diff.imageRiskDelta,
          newIssues: saved.diff.newIssues.length,
          resolvedIssues: saved.diff.resolvedIssues.length,
        }
      : null,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => runScan(request);
export const action = async ({ request }: ActionFunctionArgs) => runScan(request);

export default function CatalogCheckDashboard() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data || initial;
  const report = data.report;
  const loading = fetcher.state !== "idle";
  const pro = data.entitlement.plan === "pro";

  return (
    <s-page heading="Catalog readiness check">
      <s-button
        slot="primary-action"
        onClick={() =>
          fetcher.submit({}, { method: "post", defaultShouldRevalidate: false })
        }
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
          {pro ? <s-badge tone="success">Pro monitoring active</s-badge> : null}
          <s-text>
            {report.productsChecked} products · {report.variantsChecked} variants · {report.imagesChecked} images
          </s-text>
        </s-stack>

        {data.productPaginationCapped ? (
          <s-banner tone="warning" heading="Catalog scan limit reached">
            This {pro ? "Pro" : "Free"} scan checks up to {data.limits.maxProducts.toLocaleString()} products. Results shown here cover the first {data.limits.maxProducts.toLocaleString()} products returned in Shopify product-ID order.
          </s-banner>
        ) : null}

        {data.changeSummary && (
          <s-banner
            tone={data.changeSummary.scoreDelta < 0 ? "warning" : "info"}
            heading="Change since the previous saved Pro scan"
          >
            Score {data.changeSummary.scoreDelta >= 0 ? "+" : ""}{data.changeSummary.scoreDelta}; critical issues {data.changeSummary.errorDelta >= 0 ? "+" : ""}{data.changeSummary.errorDelta}; warnings {data.changeSummary.warningDelta >= 0 ? "+" : ""}{data.changeSummary.warningDelta}; image risks {data.changeSummary.imageRiskDelta >= 0 ? "+" : ""}{data.changeSummary.imageRiskDelta}. {data.changeSummary.newIssues} new findings and {data.changeSummary.resolvedIssues} resolved findings.
          </s-banner>
        )}
      </s-section>

      <s-section heading="2027 image readiness">
        <s-stack direction="inline" gap="base">
          <s-badge tone={report.imageReadiness.imagesBelow500 || report.imageReadiness.productsMissingImages ? "warning" : "success"}>
            {report.imageReadiness.readyPercent}% checked images at or above 500×500
          </s-badge>
          <s-text>
            {report.imageReadiness.productsMissingImages} products missing images · {report.imageReadiness.imagesBelow500} checked images below 500×500
          </s-text>
        </s-stack>
        <s-paragraph>
          The current readiness target tracks Google Merchant Center's announced 500×500 minimum taking effect January 31, 2027. This remains a catalog-readiness signal, not a guarantee of Merchant Center approval.
        </s-paragraph>
      </s-section>

      <s-section heading="Issues to review">
        {report.issues.length === 0 ? (
          <s-banner tone="success" heading="No issues found by this scan">
            This is a catalog-readiness check, not a guarantee of approval by Google Merchant Center or any other sales channel.
          </s-banner>
        ) : (
          report.issues.slice(0, pro ? 250 : 100).map((entry: any, index: number) => (
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
        {report.issues.length > (pro ? 250 : 100) ? (
          <s-text tone="neutral">
            Showing the first {pro ? 250 : 100} findings from this scan.
          </s-text>
        ) : null}
      </s-section>

      <s-section heading="Checks included">
        <s-paragraph>
          The scan reviews product titles, vendor/brand presence, Online Store URLs, product images, image dimensions when Shopify provides them, variant identifiers, prices, and duplicate option combinations.
        </s-paragraph>
        <s-paragraph>
          The app requests read-only product access and does not edit products or variants.
        </s-paragraph>
        {pro ? (
          <s-link href="/app/pro">Open Pro monitoring, history and reports</s-link>
        ) : (
          <>
            <s-text tone="neutral">
              Free scans use the current standard limits. Pro capabilities are implemented behind the subscription entitlement boundary.
            </s-text>
            {data.planSelectionUrl ? (
              <>
                <br />
                <a href={data.planSelectionUrl} target="_top">
                  View Free and Pro plans in Shopify
                </a>
              </>
            ) : null}
          </>
        )}
        <br />
        <s-link href="/app/support">Support and data handling</s-link>
      </s-section>
    </s-page>
  );
}
