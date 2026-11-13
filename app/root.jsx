import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource-variable/dm-sans/wght.css";
import "./styles/theme.css";
import "./styles/brand.css";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="merchant-shell">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
