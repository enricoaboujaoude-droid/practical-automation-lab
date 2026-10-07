import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useEffect, useRef } from "react";
import prisma from "../db.server";
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

  let shouldPersist = entitlement.plan === "pro" && persistHistory;

  if (entitlement.plan === "pro" && !persistHistory) {
    const existingBaseline = await prisma.catalogScan.findFirst({
      where: { shop: session.shop },
      select: { id: true },
    });

    if (!existingBaseline) {
      shouldPersist = true;
    }
  }

  const saved =
    shouldPersist
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
  const reviewRequestHandled = useRef(false);

  useEffect(() => {
    if (
      fetcher.state !== "idle" ||
      !fetcher.data ||
      reviewRequestHandled.current ||
      Number(fetcher.data.report?.productsChecked || 0) < 1
    ) {
      return;
    }

    reviewRequestHandled.current = true;

    const storageKey = "pal.catalog-check.review-next-at";
    const now = Date.now();
    let nextAllowedAt = 0;

    try {
      nextAllowedAt = Number(window.localStorage.getItem(storageKey) || "0");
    } catch {
      nextAllowedAt = 0;
    }

    if (Number.isFinite(nextAllowedAt) && nextAllowedAt > now) {
      return;
    }

    const day = 24 * 60 * 60 * 1000;
    const timer = window.setTimeout(() => {
      void (async () => {
        const reviews = (window as any).shopify?.reviews;
        if (!reviews?.request) return;

        try {
          const result = await reviews.request();
          const code = String(result?.code || "");

          let delayDays = 30;
          if (result?.success || code === "already-reviewed") delayDays = 365;
          else if (code === "cancelled" || code === "annual-limit-reached") delayDays = 365;
          else if (code === "cooldown-period") delayDays = 90;
          else if (code === "recently-installed") delayDays = 14;
          else if (code === "merchant-ineligible" || code === "mobile-app") delayDays = 30;
          else if (code === "already-open" || code === "open-in-progress") delayDays = 1;

          try {
            window.localStorage.setItem(
              storageKey,
              String(Date.now() + delayDays * day),
            );
          } catch {
            // Local storage is an optional throttle only.
          }

          if (!result?.success) {
            console.info(
              `PAL review modal not shown: ${code || "unknown"} ${String(
                result?.message || "",
              )}`,
            );
          }
        } catch (error) {
          console.info("PAL review request unavailable", error);
        }
      })();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [fetcher.data, fetcher.state]);

  return (
    <s-page heading="AI commerce readiness">
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
            A read-only AIEO view of product-data issues that can reduce
            machine readability across AI shopping and feed channels. PAL never edits products or variants.
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
          <div className="pal-metric-label">AIEO readiness score</div>
          <div className="pal-metric-value">{report.score}%</div>
          <div className="pal-metric-note">
            AI-commerce catalog readiness from this scan
          </div>
        </div>

        <div className="pal-metric-card">
          <div className="pal-metric-label">Critical issues</div>
          <div className="pal-metric-value">{report.errors}</div>
          <div className="pal-metric-note">
            Issues that can block reliable machine-readable product data
          </div>
        </div>

        <div className="pal-metric-card">
          <div className="pal-metric-label">Warnings</div>
          <div className="pal-metric-value">{report.warnings}</div>
          <div className="pal-metric-note">
            Fields worth reviewing before AI and feed distribution
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

      {!pro ? (
        <s-section
          heading={
            report.errors || report.warnings
              ? `Keep tracking these ${report.errors + report.warnings} findings`
              : "Keep catalog health from drifting"
          }
        >
          <s-paragraph>
            {report.errors || report.warnings
              ? `This scan found ${report.errors} critical issue${report.errors === 1 ? "" : "s"} and ${report.warnings} warning${report.warnings === 1 ? "" : "s"}. Pro saves scan history and automatically shows what is new, resolved, or getting worse.`
              : "Free gives you an on-demand snapshot. Pro saves scan history and monitors for regressions as the catalog changes."}
          </s-paragraph>
          <s-paragraph>
            Pro also adds recurring scans, health alerts, scheduled reports,
            CSV exports, 2027 image-readiness monitoring, and higher scan
            limits. $19/month or $199/year.
          </s-paragraph>
          <div className="pal-actions-row">
            {data.planSelectionUrl ? (
              <a
                className="pal-link-button"
                href={data.planSelectionUrl}
                target="_top"
                rel="noopener"
              >
                Upgrade to Pro in Shopify
              </a>
            ) : (
              <s-link href="/app/pro">See Pro monitoring capabilities</s-link>
            )}
          </div>
        </s-section>
      ) : null}

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

      <s-section heading="What PAL checks for AIEO">
        <s-paragraph>
          Product titles, vendor/brand presence, Online Store URLs, product
          images, image dimensions when Shopify provides them, variant
          identifiers, prices, availability signals, and duplicate option combinations.
          AIEO complements SEO by improving the structured catalog data AI systems can parse.
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
              Upgrade to Pro — $19/month or $199/year
            </a>
          ) : null}

          <s-link href="/app/support">Support and data handling</s-link>
        </div>
      </s-section>
    </s-page>
  );
}
