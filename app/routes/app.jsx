import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { OpenInBrowser } from "../components/OpenInBrowser";
import "../styles/notifications.css";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    // eslint-disable-next-line no-undef
    apiKey: process.env.SHOPIFY_API_KEY || "",
    // eslint-disable-next-line no-undef
    appUrl: process.env.SHOPIFY_APP_URL || "https://shopify-mobile-app-tau.vercel.app",
  };
};

export default function App() {
  const { apiKey, appUrl } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <OpenInBrowser appUrl={appUrl}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/design">App studio</s-link>
          <s-link href="/app/notifications">Push notifications</s-link>
        </s-app-nav>
        <Outlet />
      </OpenInBrowser>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
