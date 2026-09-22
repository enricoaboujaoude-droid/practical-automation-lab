import type { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const hasShopifyContext =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.get("embedded") === "1";

  if (hasShopifyContext) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `/app${url.search}`,
        "Cache-Control": "no-store",
      },
    });
  }

  return null;
};

export default function IndexRoute() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "64px auto",
        padding: "0 24px",
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#202223",
      }}
    >
      <div
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 42,
          height: 42,
          borderRadius: 12,
          background: "#202223",
          color: "#fff",
          fontWeight: 800,
          marginBottom: 18,
        }}
      >
        PAL
      </div>
      <h1 style={{ margin: "0 0 12px", fontSize: 32 }}>
        PAL Catalog Check
      </h1>
      <p style={{ color: "#6d7175", lineHeight: 1.6, fontSize: 16 }}>
        PAL Catalog Check is an embedded Shopify Admin app for read-only
        catalog-readiness scanning, issue diagnostics, monitoring and reports.
      </p>
      <p style={{ color: "#6d7175", lineHeight: 1.6, fontSize: 16 }}>
        Open the app from <strong>Apps → PAL Catalog Check</strong> inside your
        Shopify Admin so Shopify can provide the authenticated store context.
      </p>
      <p style={{ marginTop: 24 }}>
        <a
          href="https://practical-automation-lab.onrender.com/shopify-feed-health-support.html"
          style={{ color: "#005bd3", fontWeight: 650 }}
        >
          Support and review information
        </a>
      </p>
    </main>
  );
}
