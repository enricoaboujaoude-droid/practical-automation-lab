import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { trackAppEvent } from "../lib/events.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  trackAppEvent("app_opened");
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function AppLayout() {
  const { apiKey } = useLoaderData<typeof loader>();
  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Feed health</s-link>
        <s-link href="/app/pricing">Plans</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() { return boundary.error(useRouteError()); }
export const headers: HeadersFunction = (args) => boundary.headers(args);
