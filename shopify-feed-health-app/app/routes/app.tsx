import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { trackAppEvent } from "../lib/events.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  trackAppEvent("app_opened");
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

function navCurrent(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app" || pathname === "/app/";
  return pathname.startsWith(href);
}

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();
  const location = useLocation();

  const links = [
    { href: "/app", label: "Catalog check" },
    { href: "/app/pro", label: "Monitoring & reports" },
    { href: "/app/support", label: "Support" },
  ];

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="pal-shell">
        <header className="pal-topbar">
          <div className="pal-topbar-inner">
            <div className="pal-brand">
              <div className="pal-brand-mark" aria-hidden="true">
                PAL
              </div>
              <div className="pal-brand-copy">
                <div className="pal-brand-title">PAL Catalog Check</div>
                <div className="pal-brand-subtitle">
                  Read-only Shopify catalog intelligence
                </div>
              </div>
            </div>

            <nav className="pal-nav" aria-label="PAL Catalog Check">
              {links.map((item) => {
                const current = navCurrent(location.pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="pal-nav-link"
                    aria-current={current ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="pal-page-wrap">
          <Outlet />
        </main>
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
