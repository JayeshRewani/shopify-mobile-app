import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { OpenInBrowser } from "../components/OpenInBrowser";
import "../styles/notifications.css";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <OpenInBrowser>
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
