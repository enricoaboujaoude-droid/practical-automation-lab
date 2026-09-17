import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { trackAppEvent } from "../lib/events.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  trackAppEvent("plan_intent");
  return null;
};

export default function Pricing() {
  return (
    <s-page heading="Planned plans">
      <s-banner tone="info" heading="Development-store validation only">No real charge is created in this build. Billing activates only after the product and publication gates are satisfied.</s-banner>
      <s-section heading="Free"><s-paragraph>On-demand catalog scan and core readiness checks for validation and merchant acquisition.</s-paragraph></s-section>
      <s-section heading="Pro"><s-paragraph>Recurring monitoring, broader remediation, larger-catalog workflows, alerts, and saved scan history.</s-paragraph></s-section>
      <s-section heading="Agency / Commercial"><s-paragraph>Multiple stores, client-ready exports, batch workflows, portfolio monitoring, and white-label direction.</s-paragraph></s-section>
    </s-page>
  );
}
