import { useEffect, useState } from "react";

/**
 * Shopify installs the app inside an admin iframe. Merchants asked for the
 * full app in a normal browser tab. We keep embedded=true for Auth/App Bridge,
 * auto-open the current URL in a new tab once per session, and show a clear gate
 * if the popup is blocked.
 */
export function OpenInBrowser({ children }) {
  const [mode, setMode] = useState("checking");
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    const framed = window.self !== window.top;
    if (!framed) {
      setMode("top");
      return;
    }

    setMode("framed");
    const flag = "mobile-app-open-in-browser";
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, "1");
    const popup = window.open(window.location.href, "_blank", "noopener,noreferrer");
    if (popup) setOpened(true);
  }, []);

  if (mode === "checking") {
    return <div className="browser-gate browser-gate-loading">Opening app…</div>;
  }

  if (mode === "framed") {
    return (
      <div className="browser-gate">
        <div className="browser-gate-card">
          <p className="browser-gate-kicker">Mobile app</p>
          <h1>Open in your browser</h1>
          <p>
            This app runs best in a full browser tab — same idea as many Shopify
            apps that leave the small admin frame.
          </p>
          {opened ? (
            <p className="browser-gate-ok">
              A new tab was opened. Use that tab for the full app. You can leave
              this panel or continue here.
            </p>
          ) : (
            <p className="browser-gate-warn">
              Your browser blocked the popup. Click the button below once.
            </p>
          )}
          <div className="browser-gate-actions">
            <button
              type="button"
              className="browser-gate-primary"
              onClick={() => {
                const popup = window.open(
                  window.location.href,
                  "_blank",
                  "noopener,noreferrer",
                );
                if (popup) setOpened(true);
              }}
            >
              Open app in new tab
            </button>
            <button
              type="button"
              className="browser-gate-secondary"
              onClick={() => setMode("top")}
            >
              Continue in admin frame
            </button>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
