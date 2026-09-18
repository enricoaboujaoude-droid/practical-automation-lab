type AdminClient = {
  graphql: (query: string, options?: Record<string, unknown>) => Promise<Response>;
};

type SubscriptionItem = {
  handle?: string | null;
  description?: string | null;
  price?: {
    __typename?: string | null;
    active?: boolean | null;
    currency?: string | null;
    amount?: string | number | null;
  } | null;
};

export type ActiveSubscription = {
  billingPeriod?: string | null;
  cancelAtEndOfCycle?: boolean | null;
  trialEndsAt?: string | null;
  items?: SubscriptionItem[] | null;
} | null;

const PARTNER_API_VERSION = "2026-07";

function configuration() {
  return {
    token: String(process.env.SHOPIFY_PARTNER_API_TOKEN || "").trim(),
    orgId: String(process.env.SHOPIFY_PARTNER_ORG_ID || "236215501").trim(),
    appGid: String(process.env.SHOPIFY_PARTNER_APP_GID || "").trim(),
  };
}

export function partnerSubscriptionConfigured() {
  const config = configuration();
  return Boolean(config.token && config.orgId && config.appGid);
}

export async function getShopGid(admin: AdminClient) {
  const response = await admin.graphql(`#graphql
    query PalShopId {
      shop { id }
    }
  `);
  const body = await response.json();

  if (!response.ok || body.errors?.length || !body.data?.shop?.id) {
    throw new Error("Unable to resolve Shopify shop ID for billing.");
  }

  return String(body.data.shop.id);
}

export async function fetchActiveSubscription(
  shopId: string,
): Promise<ActiveSubscription> {
  const config = configuration();
  if (!config.token || !config.orgId || !config.appGid) return null;

  const response = await fetch(
    `https://partners.shopify.com/${encodeURIComponent(config.orgId)}/api/${PARTNER_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-access-token": config.token,
      },
      body: JSON.stringify({
        query: `#graphql
          query PalActiveSubscription($appId: ID!, $shopId: ID!) {
            activeSubscription(appId: $appId, shopId: $shopId) {
              billingPeriod
              cancelAtEndOfCycle
              trialEndsAt
              items {
                handle
                description
                price {
                  __typename
                  active
                  currency
                  ... on FlatRatePrice {
                    amount
                  }
                }
              }
            }
          }
        `,
        variables: {
          appId: config.appGid,
          shopId,
        },
      }),
    },
  );

  const body = await response.json();

  if (!response.ok || body.errors?.length) {
    throw new Error("Shopify Partner API subscription lookup failed.");
  }

  return body.data?.activeSubscription ?? null;
}

export function subscriptionIsPro(subscription: ActiveSubscription) {
  if (!subscription?.items?.length) return false;

  const configuredHandles = new Set(
    String(process.env.PAL_PRO_PLAN_HANDLES || "pro,pro_plan")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return subscription.items.some((item) => {
    const handle = String(item?.handle || "").trim().toLowerCase();
    if (handle && configuredHandles.has(handle)) return true;

    if (item?.price?.__typename === "FlatRatePrice") {
      const amount = Number(item.price.amount || 0);
      return Boolean(
        item.price.active !== false &&
          Number.isFinite(amount) &&
          amount > 0
      );
    }

    return false;
  });
}

export async function hasPaidProSubscription(admin: AdminClient) {
  if (!partnerSubscriptionConfigured()) return false;

  try {
    const shopId = await getShopGid(admin);
    const subscription = await fetchActiveSubscription(shopId);
    return subscriptionIsPro(subscription);
  } catch {
    console.error("[pal-pro] subscription_lookup_failed");
    return false;
  }
}
