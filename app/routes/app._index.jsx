import { useEffect } from "react";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { asArray } from "../services/mobile-http.server";
import { syncShop } from "../services/shop-sync.server";
import "../styles/studio.css";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  let config = await db.shopConfig.findUnique({ where: { shop: session.shop } });
  let syncFailure = "";

  if (
    !config?.storefrontAccessToken ||
    (!config.syncedAt && !config.syncError)
  ) {
    try {
      config = await syncShop({ admin, shop: session.shop });
    } catch (error) {
      syncFailure = error.message;
      console.error(`Store sync failed for ${session.shop}`, error);
      config = await db.shopConfig.findUnique({ where: { shop: session.shop } });
    }
  }

  const shop = config?.shop || session.shop;

  return {
    shopDomain: shop,
    shopName: config?.shopName || shop,
    currencyCode: config?.currencyCode || "",
    syncedAt: formatWhen(config?.syncedAt),
    syncError: config?.syncError || syncFailure,
    warnings: asArray(config?.warnings),
    snapshotPartial: Object.values(config?.truncated || {}).some(Boolean),
    connected: Boolean(config?.storefrontAccessToken),
    published: Boolean(config?.publishedDesign),
    publishedSections: sectionCount(config?.publishedDesign),
    draftSections: sectionCount(config?.draftDesign),
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    await syncShop({ admin, shop: session.shop });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

export default function Index() {
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const data = useLoaderData();
  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";
  const syncError = fetcher.data?.error || data.syncError;

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Store synced");
    }
  }, [fetcher.data, shopify]);

  const syncStore = () => fetcher.submit({}, { method: "POST" });
  const nextStep = !data.connected
    ? "Sync the store so the phone can read the catalog."
    : !data.draftSections
      ? "Open the designer and add the first home section."
      : !data.published
        ? "Publish the design so the phone can load it."
        : "The phone loads this design the next time it opens.";

  return (
    <div className="welcome">
      <section className="welcome-story">
        <div className="studio-brand">
          <span className="studio-mark" />
          Mobile app
        </div>
        <h1>
          You&apos;re connected.
          <br />
          Here&apos;s what&apos;s next.
        </h1>
        <ul>
          <li>Open the app studio</li>
          <li>Arrange the home screen</li>
          <li>Publish, then open the phone</li>
        </ul>
        <p className="welcome-note">{nextStep}</p>
      </section>
      <section className="welcome-panel">
        <div className="welcome-card">
          <h2>{data.shopName}</h2>
          <p className="hint">
            {data.shopDomain}
            {data.currencyCode ? ` · ${data.currencyCode}` : ""}
          </p>
          {syncError ? <p className="studio-error">{syncError}</p> : null}
          {data.snapshotPartial ? (
            <p className="hint">
              The store copy is partial. The phone still reads the live catalog.
            </p>
          ) : null}
          <dl className="status-list">
            <div>
              <dt>Store</dt>
              <dd>{data.connected ? `Synced ${data.syncedAt}` : "Not synced"}</dd>
            </div>
            <div>
              <dt>Home screen</dt>
              <dd>
                {data.draftSections
                  ? `${data.draftSections} section${data.draftSections === 1 ? "" : "s"} in the draft`
                  : "No sections yet"}
              </dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>
                {data.published
                  ? `${data.publishedSections} published section${data.publishedSections === 1 ? "" : "s"}`
                  : "Nothing published yet"}
              </dd>
            </div>
          </dl>
          <Link className="publish welcome-go" to="/app/design">
            Open app studio
          </Link>
          <button className="quiet" type="button" onClick={syncStore} disabled={isLoading}>
            {isLoading ? "Syncing" : "Sync store"}
          </button>
          {data.warnings.length ? (
            <ul className="setup-warnings">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function sectionCount(design) {
  return Array.isArray(design?.home) ? design.home.length : 0;
}

function formatWhen(value) {
  if (!value) return "not set yet";
  return (
    new Date(value).toLocaleString("en-GB", {
      timeZone: "UTC",
      hour12: false,
    }) + " UTC"
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
