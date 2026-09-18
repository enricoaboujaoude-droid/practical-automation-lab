import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Support() {
  return (
    <s-page heading="Support & data handling">
      <div className="pal-intro">
        <div>
          <div className="pal-eyebrow">Trust & support</div>
          <p className="pal-subtitle">
            PAL Catalog Check is intentionally read-only. This page explains
            scan boundaries, stored Pro data, privacy behavior, and how to get
            help without exposing sensitive store information.
          </p>
        </div>
        <div className="pal-status-row">
          <s-badge tone="success">Read-only access</s-badge>
          <s-badge tone="success">No customer data</s-badge>
          <s-badge tone="success">No order data</s-badge>
        </div>
      </div>

      <s-section heading="What the app does">
        <s-paragraph>
          PAL Catalog Check reviews Shopify product data for catalog-readiness
          risks and explains each finding. It does not edit products, variants,
          images, prices, or publication settings.
        </s-paragraph>
      </s-section>

      <s-section heading="Free and Pro data handling">
        <s-paragraph>
          Free scans process catalog data to generate the current result and do
          not create saved PAL scan history. Pro monitoring stores bounded
          scan-result snapshots, monitoring preferences, alerts, and scheduled
          report summaries so history, change detection, recurring scans, and
          report exports can work.
        </s-paragraph>
        <s-paragraph>
          PAL also stores the Shopify authentication session required to remain
          installed and records limited aggregate operational events such as app
          opens and scan completion. Stored PAL shop data is deleted when the
          app processes an uninstall or Shopify shop-redaction event.
        </s-paragraph>
        <s-link href="https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html">
          Read the privacy policy
        </s-link>
      </s-section>

      <s-section heading="Scan boundaries">
        <div className="pal-metric-grid">
          <div className="pal-metric-card">
            <div className="pal-metric-label">Free products</div>
            <div className="pal-metric-value">2,500</div>
            <div className="pal-metric-note">Per catalog scan</div>
          </div>
          <div className="pal-metric-card">
            <div className="pal-metric-label">Pro products</div>
            <div className="pal-metric-value">10,000</div>
            <div className="pal-metric-note">Per bounded Pro scan</div>
          </div>
          <div className="pal-metric-card">
            <div className="pal-metric-label">Pro variants</div>
            <div className="pal-metric-value">250</div>
            <div className="pal-metric-note">Per product</div>
          </div>
          <div className="pal-metric-card">
            <div className="pal-metric-label">Pro images</div>
            <div className="pal-metric-value">100</div>
            <div className="pal-metric-note">Per product</div>
          </div>
        </div>
        <s-paragraph>
          Free scans support up to 100 variants and 20 images per product. PAL
          warns when a configured boundary is reached so a partial scan is not
          mistaken for a complete one.
        </s-paragraph>
      </s-section>

      <s-section heading="Pro monitoring">
        <s-paragraph>
          Pro adds recurring scans, saved history, change detection, readiness
          alerts, January 31, 2027 image-readiness monitoring, CSV exports,
          larger scan limits, and scheduled report snapshots. Merchant billing
          is handled separately through Shopify App Pricing.
        </s-paragraph>
      </s-section>

      <s-section heading="Get help">
        <s-paragraph>
          During public beta, report reproducible issues or product feedback in
          the Practical Automation Lab support thread. Never include store
          passwords, Shopify access tokens, recovery codes, customer
          information, or confidential catalog exports.
        </s-paragraph>
        <s-link href="https://github.com/enricoaboujaoude-droid/practical-automation-lab/issues/4">
          Open beta support & feedback
        </s-link>
      </s-section>

      <s-section heading="Merchant Center note">
        <s-paragraph>
          PAL provides readiness guidance based on fields available through
          Shopify. PAL is not affiliated with Google and does not guarantee
          Google Merchant Center approval.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
