import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { scanCatalog } from "../lib/catalog-scan.server";
import { getEntitlementForShop } from "../lib/entitlements.server";
import { persistProScan } from "../lib/pro-monitoring.server";
import { trackAppEvent } from "../lib/events.server";
import { getPlanSelectionUrl } from "../lib/billing-links.server";

async function runScan(request: Request, persistHistory: boolean) {
  const { admin, session } = await authenticate.admin(request);
  const entitlement = await getEntitlementForShop(session.shop, admin);

  trackAppEvent("scan_started");
  const result = await scanCatalog(admin, entitlement.limits);
  const saved =
    entitlement.plan === "pro" && persistHistory
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

export const loader = async ({ request }: LoaderFunctionArgs) =>
  runScan(request, false);
export const action = async ({ request }: ActionFunctionArgs) =>
  runScan(request, true);

export default function CatalogCheckDashboard() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const data = fetcher.data || initial;
  const report = data.report;
  const loading = fetcher.state !== "idle";
  const pro = data.entitlement.plan === "pro";
  const displayedIssueLimit = pro ? 250 : 100;

  return (
    <s-page heading="Catalog readiness">
      <s-button
        slot="primary-action"
        onClick={() =>
          fetcher.submit({}, { method: "post", defaultShouldRevalidate: false })
        }
        disabled={loading}
      >
        {loading ? "Scanning…" : "Rescan catalog"}
      </s-button>

      <div className="pal-intro">
        <div>
          <div className="pal-eyebrow">
            {pro ? "Pro monitoring enabled" : "Free catalog check"}
          </div>
          <p className="pal-subtitle">
            A read-only view of the catalog issues most likely to create
            product-feed friction. PAL never edits products or variants.
          </p>
        </div>
        <div className="pal-status-row">
          {pro ? <s-badge tone="success">Pro active</s-badge> : null}
          <s-badge tone={report.errors ? "critical" : "success"}>
            {report.errors ? "Needs attention" : "No critical issues"}
          </s-badge>
        </div>
      </div>

      <div className="pal-metric-grid">
        <div className="pal-metric-card">
          <div className="pal-metric-label">Readiness score</div>
          <div className="pal-metric-value">{report.score}%</div>
          <div className="pal-metric-note">
            Overall catalog readiness from this scan
          </div>
        </div>

        <div className="pal-metric-card">
          <div className="pal-metric-label">Critical issues</div>
          <div className="pal-metric-value">{report.errors}</div>
          <div className="pal-metric-note">
            Issues that can block reliable feed preparation
          </div>
        </div>

        <div className="pal-metric-card">
          <div className="pal-metric-label">Warnings</div>
          <div className="pal-metric-value">{report.warnings}</div>
          <div className="pal-metric-note">
            Fields worth reviewing before distribution
          </div>
        </div>

        <div className="pal-metric-card">
          <div className="pal-metric-label">Catalog checked</div>
          <div className="pal-metric-value">{report.productsChecked}</div>
          <div className="pal-metric-note">
            {report.variantsChecked} variants · {report.imagesChecked} images
          </div>
        </div>
      </div>

      {data.productPaginationCapped ? (
        <s-banner tone="warning" heading="Catalog scan limit reached">
          This {pro ? "Pro" : "Free"} scan checks up to{" "}
          {data.limits.maxProducts.toLocaleString()} products. Results shown
          here cover the first {data.limits.maxProducts.toLocaleString()}{" "}
          products returned in Shopify product-ID order.
        </s-banner>
      ) : null}

      {data.changeSummary ? (
        <s-banner
          tone={data.changeSummary.scoreDelta < 0 ? "warning" : "info"}
          heading="Change since the previous saved Pro scan"
        >
          Score {data.changeSummary.scoreDelta >= 0 ? "+" : ""}
          {data.changeSummary.scoreDelta}; critical issues{" "}
          {data.changeSummary.errorDelta >= 0 ? "+" : ""}
          {data.changeSummary.errorDelta}; warnings{" "}
          {data.changeSummary.warningDelta >= 0 ? "+" : ""}
          {data.changeSummary.warningDelta}; image risks{" "}
          {data.changeSummary.imageRiskDelta >= 0 ? "+" : ""}
          {data.changeSummary.imageRiskDelta}. {data.changeSummary.newIssues}{" "}
          new findings and {data.changeSummary.resolvedIssues} resolved findings.
        </s-banner>
      ) : null}

      <s-section heading="2027 image readiness">
        <div className="pal-status-row">
          <s-badge
            tone={
              report.imageReadiness.imagesBelow500 ||
              report.imageReadiness.productsMissingImages
                ? "warning"
                : "success"
            }
          >
            {report.imageReadiness.readyPercent}% image-ready
          </s-badge>
          <s-text>
            {report.imageReadiness.productsMissingImages} products missing
            images · {report.imageReadiness.imagesBelow500} checked images below
            500×500
          </s-text>
        </div>
        <s-paragraph>
          Tracks Google's announced 500×500 minimum image requirement taking
          effect January 31, 2027. This is readiness guidance, not a guarantee
          of Merchant Center approval.
        </s-paragraph>
      </s-section>

      <s-section heading="Issues to review">
        {report.issues.length === 0 ? (
          <s-banner tone="success" heading="No issues found by this scan">
            PAL found no catalog-readiness issues within the fields and scan
            boundaries checked.
          </s-banner>
        ) : (
          <div className="pal-issue-list">
            {report.issues
              .slice(0, displayedIssueLimit)
              .map((entry: any, index: number) => (
                <div
                  className="pal-issue-card"
                  key={`${entry.code}-${entry.productId}-${index}`}
                >
                  <div className="pal-issue-head">
                    <s-badge
                      tone={entry.level === "error" ? "critical" : "warning"}
                    >
                      {entry.level === "error" ? "Critical" : "Warning"}
                    </s-badge>
                    <s-text type="strong">{entry.title}</s-text>
                    <s-text tone="neutral">{entry.code}</s-text>
                  </div>
                  <div className="pal-issue-message">{entry.message}</div>
                  <div className="pal-remediation">
                    <strong>Recommended action:</strong> {entry.remediation}
                  </div>
                </div>
              ))}
          </div>
        )}

        {report.issues.length > displayedIssueLimit ? (
          <div className="pal-meta-strip">
            Showing the first {displayedIssueLimit} findings from this scan.
          </div>
        ) : null}
      </s-section>

      <s-section heading="What PAL checks">
        <s-paragraph>
          Product titles, vendor/brand presence, Online Store URLs, product
          images, image dimensions when Shopify provides them, variant
          identifiers, prices, and duplicate option combinations.
        </s-paragraph>

        <div className="pal-actions-row">
          {pro ? (
            <s-link href="/app/pro">
              Open monitoring, history and reports
            </s-link>
          ) : data.planSelectionUrl ? (
            <a
              className="pal-link-button"
              href={data.planSelectionUrl}
              target="_top"
              rel="noopener"
            >
              View Free and Pro plans in Shopify
            </a>
          ) : null}

          <s-link href="/app/support">Support and data handling</s-link>
        </div>
      </s-section>
    </s-page>
  );
}
