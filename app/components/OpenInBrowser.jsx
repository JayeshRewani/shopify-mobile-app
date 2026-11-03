import { useEffect, useMemo, useState } from "react";

/**
 * When Shopify opens the app inside the admin iframe, send the top browser
 * window to our hosted app URL (same path + shop/host query). No popups, no
 * new-tab loop — one top-level redirect to the Vercel domain.
 */
export function OpenInBrowser({ children, appUrl }) {
  const [mode, setMode] = useState("checking");
  const targetHref = useMemo(() => buildStandaloneHref(appUrl), [appUrl]);

  useEffect(() => {
    const framed = window.self !== window.top;
    if (!framed) {
      setMode("top");
      return;
    }

    setMode("framed");
    try {
      window.top.location.replace(targetHref);
    } catch {
      // Cross-window navigation blocked; show the manual top link below.
    }
  }, [targetHref]);

  if (mode === "checking") {
    return <div className="browser-gate browser-gate-loading">Opening app…</div>;
  }

  if (mode === "framed") {
    return (
      <div className="browser-gate">
        <div className="browser-gate-card">
          <p className="browser-gate-kicker">Mobile app</p>
          <h1>Continue on the app site</h1>
          <p>
            Shopify opened this inside Admin. You will be sent to the full app
            on your domain — not another Admin popup.
          </p>
          <div className="browser-gate-actions">
            <a className="browser-gate-primary" href={targetHref} target="_top" rel="noreferrer">
              Open app site
            </a>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

function buildStandaloneHref(appUrl) {
  if (typeof window === "undefined") return appUrl || "/app";

  const current = new URL(window.location.href);
  let baseOrigin = current.origin;
  try {
    if (appUrl) baseOrigin = new URL(appUrl).origin;
  } catch {
    // keep current origin
  }

  const next = new URL(current.pathname + current.search, baseOrigin);
  return next.toString();
}
