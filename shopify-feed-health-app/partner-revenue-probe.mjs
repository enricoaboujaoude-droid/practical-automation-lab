const PARTNER_API_VERSION = "2026-07";

function config() {
  return {
    token: String(process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN || "").trim(),
    orgId: String(process.env.SHOPIFY_PARTNER_ORG_ID || "236215501").trim(),
    appGid: String(process.env.SHOPIFY_APP_GID || "").trim(),
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
    throw new Error(`Shopify Partner revenue probe failed status=${response.status}`);
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

export function startPartnerRevenueProbe() {
  void fetchPartnerRevenueProbe()
    .then((summary) => {
      console.log(
        `[pal-revenue-probe] configured=${summary.configured} sale_count=${summary.saleCount} gross_usd=${summary.grossUsd.toFixed(2)} net_usd=${summary.netUsd.toFixed(2)} non_usd_sales=${summary.nonUsdSaleCount || 0} latest=${summary.latestCreatedAt || "none"} types=${JSON.stringify(summary.byType)}`,
      );
    })
    .catch((error) => {
      console.error(
        `[pal-revenue-probe] failed message=${String(error?.message || error).replace(/\s+/g, " ").slice(0, 240)}`,
      );
    });
}
