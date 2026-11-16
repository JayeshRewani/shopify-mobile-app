import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import "../styles/notifications.css";
import "../styles/legal.css";

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    supportEmail: process.env.SUPPORT_EMAIL || "rehwanij@gmail.com",
  };
};

export default function App() {
  const { apiKey, supportEmail } = useLoaderData();
  const mailHref = `mailto:${supportEmail}?subject=${encodeURIComponent("AppMint support")}`;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/design">App studio</s-link>
        <s-link href="/app/notifications">Push notifications</s-link>
      </s-app-nav>
      <Outlet />
      <footer className="app-support-bar">
        <p>Need help with AppMint?</p>
        <div className="app-support-actions">
          <a className="app-support-btn" href="/privacy" target="_blank" rel="noreferrer">
            Privacy policy
          </a>
          <a className="app-support-btn is-primary" href={mailHref}>
            Email support
          </a>
        </div>
      </footer>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
