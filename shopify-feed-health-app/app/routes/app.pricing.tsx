import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { trackAppEvent } from "../lib/events.server";

const PLAN_TIERS: Record<string, number> = {
  pro: 1,
  growth: 2,
  agency: 3,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  trackAppEvent("pricing_viewed");
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const plan = String(formData.get("plan") || "");
  const tier = PLAN_TIERS[plan];

  if (!tier) {
    return { ok: false };
  }

  trackAppEvent("plan_intent", { tier });
  return { ok: true };
};

export default function Pricing() {
  const fetcher = useFetcher<typeof action>();
  const recording = fetcher.state !== "idle";

  const recordInterest = (plan: keyof typeof PLAN_TIERS) => {
    fetcher.submit({ plan }, { method: "post" });
  };

  return (
    <s-page heading="Planned plans">
      <s-banner tone="info" heading="Development-store validation only">
        No real charge is created in this build. Billing activates only after the product and publication gates are satisfied.
      </s-banner>

      {fetcher.data?.ok ? (
        <s-banner tone="success" heading="Interest recorded">
          Thanks. This records only an aggregate plan-interest event; no checkout or charge was created.
        </s-banner>
      ) : null}

      <s-section heading="Free">
        <s-paragraph>
          On-demand catalog scan and core readiness checks for validation and merchant acquisition.
        </s-paragraph>
      </s-section>

      <s-section heading="Pro — validation target around $19/month">
        <s-paragraph>
          Recurring monitoring, broader remediation, larger-catalog workflows, alerts, and saved scan history.
        </s-paragraph>
        <s-button onClick={() => recordInterest("pro")} disabled={recording}>
          I would consider Pro
        </s-button>
      </s-section>

      <s-section heading="Growth — validation target around $49/month">
        <s-paragraph>
          Higher catalog limits, more frequent monitoring, exports, and deeper operational reporting for larger stores.
        </s-paragraph>
        <s-button onClick={() => recordInterest("growth")} disabled={recording}>
          I would consider Growth
        </s-button>
      </s-section>

      <s-section heading="Agency / Commercial — pricing to validate">
        <s-paragraph>
          Multiple stores, client-ready exports, batch workflows, portfolio monitoring, and white-label direction.
        </s-paragraph>
        <s-button onClick={() => recordInterest("agency")} disabled={recording}>
          I would consider Agency
        </s-button>
      </s-section>
    </s-page>
  );
}
