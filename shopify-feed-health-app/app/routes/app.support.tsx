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
          This app performs a read-only catalog-readiness check using Shopify product data. It flags missing or risky product-feed fields and explains the finding without editing your products or variants.
        </s-paragraph>
      </s-section>

      <s-section heading="Data handling">
        <s-paragraph>
          Product and variant data is processed to generate the current scan and is not persisted as a merchant catalog database. The app stores the Shopify authentication session needed to remain installed and logs aggregate operational events such as app opens and scan completion.
        </s-paragraph>
        <s-paragraph>
          The app requests read-only product access. It does not request customer or order access.
        </s-paragraph>
        <s-link href="https://practical-automation-lab.onrender.com/shopify-feed-health-privacy.html">
          Read the Shopify app privacy policy
        </s-link>
      </s-section>

      <s-section heading="Current scan boundaries">
        <s-paragraph>
          A scan checks up to 2,500 products, up to 100 variants per product, and up to 20 images per product. The dashboard explicitly warns when a product has additional variants outside the checked set.
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
