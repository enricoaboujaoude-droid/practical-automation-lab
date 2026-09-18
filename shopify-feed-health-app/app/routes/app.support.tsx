import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Support() {
  return (
    <s-page heading="Support">
      <s-section heading="What the app does">
        <s-paragraph>
          PAL Catalog Check performs a read-only catalog-readiness check using Shopify product data. It flags missing or risky product-feed fields and explains the finding without editing products or variants.
        </s-paragraph>
      </s-section>

      <s-section heading="Free and Pro data handling">
        <s-paragraph>
          Free scans process product and variant data to generate the current result and do not create a saved catalog-history record. Pro monitoring stores bounded scan-result snapshots, monitoring preferences, health alerts, and scheduled report summaries so history, change detection, recurring scans, and report exports can work.
        </s-paragraph>
        <s-paragraph>
          The app also stores the Shopify authentication session needed to remain installed and logs limited aggregate operational events such as app opens and scan completion. Stored PAL Catalog Check shop data is deleted when the app processes an uninstall or Shopify shop-redaction event.
        </s-paragraph>
        <s-paragraph>
          The app requests read-only product access. It does not request customer or order access.
        </s-paragraph>
        <s-link href="https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html">
          Read the Shopify app privacy policy
        </s-link>
      </s-section>

      <s-section heading="Scan boundaries">
        <s-paragraph>
          Free scans check up to 2,500 products, up to 100 variants per product, and up to 20 images per product.
        </s-paragraph>
        <s-paragraph>
          The current Pro bounded scan design supports up to 10,000 products, up to 250 variants per product, and up to 100 images per product. The dashboard warns when a boundary is reached.
        </s-paragraph>
      </s-section>

      <s-section heading="Pro monitoring">
        <s-paragraph>
          Pro capability includes recurring scans, saved scan history, change detection, readiness-drop alerts, January 31, 2027 image-readiness monitoring, CSV exports, larger scan limits, and scheduled report snapshots. Billing remains separate from these capabilities and is activated only through Shopify App Pricing.
        </s-paragraph>
      </s-section>

      <s-section heading="Get help">
        <s-paragraph>
          During the public-beta phase, report reproducible issues or product feedback in the Practical Automation Lab beta thread. Do not post store credentials, access tokens, customer information, or confidential catalog data.
        </s-paragraph>
        <s-link href="https://github.com/enricoaboujaoude-droid/practical-automation-lab/issues/4">
          Open the beta support and feedback thread
        </s-link>
      </s-section>

      <s-section heading="Merchant Center note">
        <s-paragraph>
          Findings are readiness guidance based on catalog fields available through Shopify. The app is not affiliated with Google and does not guarantee Google Merchant Center approval.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}
