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

type MoneyValue = {
  amount?: string | number | null;
  currencyCode?: string | null;
} | null;

type RevenueTransaction = {
  __typename?: string | null;
  id?: string | null;
  createdAt?: string | null;
  billingInterval?: string | null;
  grossAmount?: MoneyValue;
  netAmount?: MoneyValue;
};

export type PartnerRevenueSummary = {
  configured: boolean;
  createdAtMin: string;
  saleCount: number;
  grossUsd: number;
  netUsd: number;
  nonUsdSaleCount: number;
  latestCreatedAt: string | null;
  byType: Record<string, number>;
};

const PARTNER_API_VERSION = "2026-07";
const CONFIRMED_PRO_CACHE_MS = 5 * 60 * 1000;
const confirmedProUntil = new Map<string, number>();

function configuration() {
  return {
    token: String(process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN || "").trim(),
    orgId: String(process.env.SHOPIFY_PARTNER_ORG_ID || "236215501").trim(),
    appGid: String(process.env.SHOPIFY_APP_GID || "").trim(),
  };
}

function partnerEndpoint(orgId: string) {
  return `https://partners.shopify.com/${encodeURIComponent(orgId)}/api/${PARTNER_API_VERSION}/graphql.json`;
}

function numericAmount(value: MoneyValue) {
  const amount = Number(value?.amount ?? 0);
  return Number.isFinite(amount) ? amount : 0;
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

  const response = await fetch(partnerEndpoint(config.orgId), {
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
  });

  const body = await response.json();

  if (!response.ok || body.errors?.length) {
    throw new Error("Shopify Partner API subscription lookup failed.");
  }

  return body.data?.activeSubscription ?? null;
}

export async function fetchPartnerRevenueSummary(
  createdAtMin = "2026-09-22T00:00:00Z",
): Promise<PartnerRevenueSummary> {
  const config = configuration();

  if (!config.token || !config.orgId || !config.appGid) {
    return {
      configured: false,
      createdAtMin,
      saleCount: 0,
      grossUsd: 0,
      netUsd: 0,
      nonUsdSaleCount: 0,
      latestCreatedAt: null,
      byType: {},
    };
  }

  const response = await fetch(partnerEndpoint(config.orgId), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": config.token,
    },
    body: JSON.stringify({
      query: `#graphql
        query PalRevenueTransactions($appId: ID!, $createdAtMin: DateTime!) {
          transactions(appId: $appId, createdAtMin: $createdAtMin, first: 100) {
            edges {
              node {
                __typename
                id
                createdAt
                ... on AppSubscriptionSale {
                  billingInterval
                  grossAmount { amount currencyCode }
                  netAmount { amount currencyCode }
                }
                ... on AppUsageSale {
                  grossAmount { amount currencyCode }
                  netAmount { amount currencyCode }
                }
                ... on AppOneTimeSale {
                  grossAmount { amount currencyCode }
                  netAmount { amount currencyCode }
                }
              }
            }
          }
        }
      `,
      variables: {
        appId: config.appGid,
        createdAtMin,
      },
    }),
  });

  const body = await response.json();

  if (!response.ok || body.errors?.length) {
    throw new Error("Shopify Partner API revenue transaction lookup failed.");
  }

  const transactions: RevenueTransaction[] = (body.data?.transactions?.edges || [])
    .map((edge: { node?: RevenueTransaction | null }) => edge?.node || null)
    .filter(Boolean);

  const saleTypes = new Set([
    "AppSubscriptionSale",
    "AppUsageSale",
    "AppOneTimeSale",
  ]);
  const sales = transactions.filter((item) =>
    saleTypes.has(String(item.__typename || "")),
  );

  let grossUsd = 0;
  let netUsd = 0;
  let nonUsdSaleCount = 0;
  let latestCreatedAt: string | null = null;
  const byType: Record<string, number> = {};

  for (const sale of sales) {
    const type = String(sale.__typename || "Unknown");
    byType[type] = (byType[type] || 0) + 1;

    const grossCurrency = String(sale.grossAmount?.currencyCode || "").toUpperCase();
    const netCurrency = String(sale.netAmount?.currencyCode || "").toUpperCase();

    if (
      (grossCurrency && grossCurrency !== "USD") ||
      (netCurrency && netCurrency !== "USD")
    ) {
      nonUsdSaleCount += 1;
    } else {
      grossUsd += numericAmount(sale.grossAmount);
      netUsd += numericAmount(sale.netAmount);
    }

    if (
      sale.createdAt &&
      (!latestCreatedAt ||
        new Date(sale.createdAt).getTime() > new Date(latestCreatedAt).getTime())
    ) {
      latestCreatedAt = sale.createdAt;
    }
  }

  return {
    configured: true,
    createdAtMin,
    saleCount: sales.length,
    grossUsd: Number(grossUsd.toFixed(2)),
    netUsd: Number(netUsd.toFixed(2)),
    nonUsdSaleCount,
    latestCreatedAt,
    byType,
  };
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

  const shopId = await getShopGid(admin);
  const cachedUntil = confirmedProUntil.get(shopId) || 0;
  if (cachedUntil > Date.now()) return true;

  try {
    const subscription = await fetchActiveSubscription(shopId);
    const isPro = subscriptionIsPro(subscription);

    if (isPro) {
      confirmedProUntil.set(shopId, Date.now() + CONFIRMED_PRO_CACHE_MS);
    } else {
      confirmedProUntil.delete(shopId);
    }

    return isPro;
  } catch (error) {
    console.error("[pal-pro] subscription_lookup_failed");
    throw error;
  }
}
