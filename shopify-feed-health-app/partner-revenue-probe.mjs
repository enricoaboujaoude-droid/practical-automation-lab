const PARTNER_API_VERSION = "2026-07";

function config() {
  return {
    token: String(process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN || "").trim(),
    orgId: String(process.env.SHOPIFY_PARTNER_ORG_ID || "236215501").trim(),
    appGid: String(process.env.SHOPIFY_APP_GID || "").trim().replace(/^gid:\/\/shopify\//, "gid://partners/"),
  };
}

function endpoint(orgId) {
  return `https://partners.shopify.com/${encodeURIComponent(orgId)}/api/${PARTNER_API_VERSION}/graphql.json`;
}

function amount(value) {
  const n = Number(value?.amount ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchPartnerRevenueProbe(createdAtMin = "2026-09-22T00:00:00Z") {
  const { token, orgId, appGid } = config();
  if (!token || !orgId || !appGid) {
    return {
      configured: false,
      createdAtMin,
      saleCount: 0,
      grossUsd: 0,
      netUsd: 0,
      latestCreatedAt: null,
      byType: {},
    };
  }

  const response = await fetch(endpoint(orgId), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": token,
    },
    body: JSON.stringify({
      query: `#graphql
        query PalRevenueProbe($appId: ID!, $createdAtMin: DateTime!) {
          transactions(appId: $appId, createdAtMin: $createdAtMin, first: 100) {
            edges {
              node {
                __typename
                createdAt
                ... on AppSubscriptionSale {
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
      variables: { appId: appGid, createdAtMin },
    }),
    signal: AbortSignal.timeout(15000),
  });

  const body = await response.json();
  if (!response.ok || body?.errors?.length) {
    const detail = Array.isArray(body?.errors) ? body.errors.slice(0, 2).map((item) => String(item?.message || "unknown").replace(/\\s+/g, " ").slice(0, 180)).join(" | ") : "unknown";
    throw new Error(`Shopify Partner revenue probe failed status=${response.status} detail=${detail}`);
  }

  const saleTypes = new Set(["AppSubscriptionSale", "AppUsageSale", "AppOneTimeSale"]);
  const sales = (body?.data?.transactions?.edges || [])
    .map((edge) => edge?.node)
    .filter((node) => node && saleTypes.has(String(node.__typename || "")));

  let grossUsd = 0;
  let netUsd = 0;
  let latestCreatedAt = null;
  const byType = {};
  let nonUsdSaleCount = 0;

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
      grossUsd += amount(sale.grossAmount);
      netUsd += amount(sale.netAmount);
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

export async function fetchPalPaymentLedger() {
  const response = await fetch(
    "https://pal-feed-auditor-events.onrender.com/metrics/payments",
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!response.ok) {
    throw new Error(`PAL payment ledger probe failed status=${response.status}`);
  }

  const body = await response.json();
  return {
    completedTransactions: Number(body?.completed_transactions || 0),
    firstCompletedAt: body?.first_completed_at || null,
    lastCompletedAt: body?.last_completed_at || null,
    activeSubscriptions: Number(body?.active_subscriptions || 0),
    grossCompletedByCurrency: body?.gross_completed_by_currency || {},
    completedByProvider: body?.completed_by_provider || {},
  };
}

export function startPartnerRevenueProbe() {
  void Promise.allSettled([
    fetchPartnerRevenueProbe(),
    fetchPalPaymentLedger(),
  ]).then(([shopify, ledger]) => {
    if (shopify.status === "fulfilled") {
      const summary = shopify.value;
      console.log(
        `[pal-revenue-probe] shopify configured=${summary.configured} sale_count=${summary.saleCount} gross_usd=${summary.grossUsd.toFixed(2)} net_usd=${summary.netUsd.toFixed(2)} non_usd_sales=${summary.nonUsdSaleCount || 0} latest=${summary.latestCreatedAt || "none"} types=${JSON.stringify(summary.byType)}`,
      );
    } else {
      console.error(
        `[pal-revenue-probe] shopify_failed message=${String(shopify.reason?.message || shopify.reason).replace(/\s+/g, " ").slice(0, 240)}`,
      );
    }

    if (ledger.status === "fulfilled") {
      const summary = ledger.value;
      console.log(
        `[pal-revenue-probe] ledger completed_transactions=${summary.completedTransactions} active_subscriptions=${summary.activeSubscriptions} gross=${JSON.stringify(summary.grossCompletedByCurrency)} providers=${JSON.stringify(summary.completedByProvider)} first=${summary.firstCompletedAt || "none"} last=${summary.lastCompletedAt || "none"}`,
      );
    } else {
      console.error(
        `[pal-revenue-probe] ledger_failed message=${String(ledger.reason?.message || ledger.reason).replace(/\s+/g, " ").slice(0, 240)}`,
      );
    }
  });
}
