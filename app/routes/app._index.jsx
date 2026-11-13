import { useEffect, useMemo } from "react";
import { Link, useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { asArray } from "../services/mobile-http.server";
import { syncShop } from "../services/shop-sync.server";
import {
  designForEditor,
  loadHomePreviewCatalog,
} from "../services/design.server";
import "../styles/overview.css";

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
  const shopName = config?.shopName || shop.replace(/\.myshopify\.com$/i, "");
  const currencyCode = config?.currencyCode || "";

  let preview = { products: [], bannerImage: "", bannerTitle: "" };
  try {
    preview = await loadHomePreviewCatalog(admin);
  } catch (error) {
    console.error(`Home preview catalog failed for ${shop}`, error);
  }

  const design = designForEditor(config?.draftDesign || config?.publishedDesign, {
    shop,
    shopName,
    currencyCode,
  });

  const bannerSection = Array.isArray(design.home)
    ? design.home.find((section) => section.type === "banner")
    : null;

  return {
    shopDomain: shop,
    shopName,
    currencyCode,
    syncedAt: formatWhen(config?.syncedAt),
    syncError: config?.syncError || syncFailure,
    warnings: asArray(config?.warnings),
    snapshotPartial: Object.values(config?.truncated || {}).some(Boolean),
    connected: Boolean(config?.storefrontAccessToken),
    published: Boolean(config?.publishedDesign),
    publishedSections: sectionCount(config?.publishedDesign),
    draftSections: sectionCount(config?.draftDesign),
    preview: {
      products: preview.products.slice(0, 2),
      bannerImage: preview.bannerImage || preview.products[0]?.image || "",
      bannerEyebrow: bannerSection?.eyebrow || shopName,
      bannerTitle:
        bannerSection?.title ||
        preview.bannerTitle ||
        (preview.products.length ? "New arrivals" : "Your storefront"),
      bannerSubtitle: bannerSection?.subtitle || "Shop this collection.",
      bannerButton: bannerSection?.buttonLabel || "Shop now",
      tagline: design.tagline || "Welcome",
      colors: design.theme?.colors || {},
    },
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

  const steps = useMemo(
    () => [
      {
        id: "sync",
        title: "Connect your store",
        detail: data.connected
          ? "Your Shopify store is connected."
          : "Sync catalog access for the phone app.",
        done: data.connected,
        badge: data.connected ? "Connected" : null,
      },
      {
        id: "design",
        title: "Design your app",
        detail: data.draftSections
          ? `${data.draftSections} section${data.draftSections === 1 ? "" : "s"} ready in App studio.`
          : "Choose your look, colors, and layouts.",
        done: data.draftSections > 0,
        href: "/app/design",
      },
      {
        id: "publish",
        title: "Publish to the phone",
        detail: data.published
          ? `${data.publishedSections} section${data.publishedSections === 1 ? "" : "s"} live for installs.`
          : "Publish a draft so phone installs can load it.",
        done: data.published,
        href: "/app/design",
      },
    ],
    [data.connected, data.draftSections, data.published, data.publishedSections],
  );

  const currentStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  const primaryHref = currentStep.id === "sync" ? null : currentStep.href || "/app/design";
  const primaryLabel =
    currentStep.id === "sync"
      ? isLoading
        ? "Syncing…"
        : "Connect store →"
      : currentStep.id === "publish"
        ? "Publish your app →"
        : "Customize your app →";

  const phoneColors = {
    "--phone-bg": data.preview.colors.background || "#F8F4E8",
    "--phone-ink": data.preview.colors.text || "#0F0F10",
    "--phone-primary": data.preview.colors.primary || "#6B0F2B",
    "--phone-muted": data.preview.colors.muted || "#6B6560",
  };

  return (
    <div className="overview">
      {syncError ? <p className="overview-error">{syncError}</p> : null}

      <div className="overview-shell">
        <section className="overview-copy" aria-labelledby="overview-title">
          <div>
            <p className="overview-kicker">Mobile studio</p>
            <h1 id="overview-title">{data.shopName} is ready to style</h1>
            <p className="overview-lead">
              Your mobile app is set up with your store, products, and brand. Just a few
              quick steps to make it yours.
            </p>
          </div>

          <div className="overview-actions">
            {primaryHref ? (
              <Link className="overview-cta" to={primaryHref}>
                {primaryLabel}
              </Link>
            ) : (
              <button
                className="overview-cta"
                type="button"
                onClick={syncStore}
                disabled={isLoading}
              >
                {primaryLabel}
              </button>
            )}
            <button
              className="overview-cta-secondary"
              type="button"
              onClick={syncStore}
              disabled={isLoading}
            >
              {isLoading ? "Syncing…" : "Sync store"}
            </button>
          </div>

          <ol className="overview-steps">
            {steps.map((step, index) => {
              const isCurrent = step.id === currentStep.id && !step.done;
              const stateClass = step.done
                ? "is-done"
                : isCurrent
                  ? "is-current"
                  : "is-todo";

              return (
                <li key={step.id} className={`overview-step ${stateClass}`}>
                  <span className="overview-step-mark" aria-hidden="true">
                    {step.done ? (
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path
                          d="M3.5 8.2 6.4 11.1 12.5 4.5"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div className="overview-step-copy">
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </div>
                  {step.done || step.badge ? (
                    <span className="overview-step-badge done">
                      {step.badge || "Done"}
                    </span>
                  ) : isCurrent && step.id === "sync" ? (
                    <button
                      className="overview-step-action"
                      type="button"
                      onClick={syncStore}
                      disabled={isLoading}
                    >
                      {isLoading ? "Syncing…" : "Continue →"}
                    </button>
                  ) : isCurrent && step.href ? (
                    <Link className="overview-step-action" to={step.href}>
                      Continue →
                    </Link>
                  ) : (
                    <span className="overview-step-badge todo">Up next</span>
                  )}
                </li>
              );
            })}
          </ol>

          {data.warnings.length ? (
            <ul className="overview-warnings">
              {data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <div className="overview-foot">
            <span className="overview-foot-dot" aria-hidden="true">
              ✓
            </span>
            <span>
              {data.connected
                ? data.snapshotPartial
                  ? "Partial catalog synced from "
                  : "Products synced from "
                : "Connect to sync products from "}
              <strong>Shopify</strong>
              {data.connected ? ` · ${data.syncedAt}` : ""}
            </span>
          </div>
        </section>

        <aside className="overview-stage" aria-label={`${data.shopName} phone preview`}>
          <div
            className={`overview-stage-label ${data.published ? "" : "is-draft"}`}
          >
            <em aria-hidden="true" />
            {data.published ? "Published preview" : "Draft preview"}
          </div>
          <div className="overview-stage-glow" aria-hidden="true" />

          <div className="phone" style={phoneColors}>
            <div className="phone-bezel">
              <div className="phone-island" aria-hidden="true" />
              <div className="phone-status">
                <span className="phone-time">9:41</span>
                <div className="phone-status-icons" aria-hidden="true">
                  <StatusSignalIcon />
                  <StatusWifiIcon />
                  <StatusBatteryIcon />
                </div>
              </div>

              <div className="phone-app">
                <div className="phone-nav">
                  <span className="phone-nav-btn" aria-hidden="true">
                    <MenuIcon />
                  </span>
                  <p className="phone-brand" title={data.shopName}>
                    {shortLabel(data.shopName, 16)}
                  </p>
                  <div className="phone-nav-actions" aria-hidden="true">
                    <SearchIcon />
                    <BagIcon />
                  </div>
                </div>

                <div className="phone-scroll">
                  <div
                    className="phone-banner"
                    style={
                      data.preview.bannerImage
                        ? {
                            backgroundImage: `linear-gradient(160deg, rgba(28,26,23,0.12), rgba(28,26,23,0.58)), url(${JSON.stringify(data.preview.bannerImage)})`,
                          }
                        : undefined
                    }
                  >
                    <p className="phone-banner-kicker">
                      {shortLabel(data.preview.bannerEyebrow, 22)}
                    </p>
                    <strong>{shortLabel(data.preview.bannerTitle, 28)}</strong>
                    <span className="phone-banner-btn">
                      {data.preview.bannerButton} →
                    </span>
                  </div>

                  <p className="phone-section-label">
                    {data.preview.products.length
                      ? "Featured"
                      : data.preview.tagline}
                  </p>

                  {data.preview.products.length ? (
                    <div className="phone-grid">
                      {data.preview.products.map((product) => (
                        <article
                          className="phone-card"
                          key={`${product.title}-${product.price}`}
                        >
                          <div
                            className="phone-card-image"
                            style={
                              product.image
                                ? {
                                    backgroundImage: `url(${JSON.stringify(product.image)})`,
                                  }
                                : undefined
                            }
                          />
                          <div className="phone-card-meta">
                            <strong title={product.title}>
                              {product.title}
                            </strong>
                            <span>
                              {formatMoney(
                                product.price,
                                product.currencyCode || data.currencyCode,
                              )}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="phone-empty">
                      Sync your store or add products in Shopify to preview them
                      here.
                    </div>
                  )}
                </div>

                <nav className="phone-tabs" aria-hidden="true">
                  <span className="is-active">
                    <HomeTabIcon />
                    Home
                  </span>
                  <span>
                    <ShopTabIcon />
                    Shop
                  </span>
                  <span>
                    <SavedTabIcon />
                    Saved
                  </span>
                  <span>
                    <AccountTabIcon />
                    Account
                  </span>
                </nav>
              </div>
            </div>
          </div>
        </aside>
      </div>
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

function formatMoney(amount, currencyCode) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return currencyCode || "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
    }).format(value);
  } catch {
    return `${currencyCode || ""} ${value}`.trim();
  }
}

function shortLabel(value, max = 18) {
  const text = String(value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function StatusSignalIcon() {
  return (
    <svg className="phone-sys-icon" viewBox="0 0 18 12" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="0.6" fill="currentColor" />
      <rect x="5" y="5" width="3" height="7" rx="0.6" fill="currentColor" />
      <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" fill="currentColor" />
      <rect x="15" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function StatusWifiIcon() {
  return (
    <svg className="phone-sys-icon" viewBox="0 0 16 12" aria-hidden="true">
      <path
        d="M8 10.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm0-3.3c1.5 0 2.9.6 3.9 1.6l-1.3 1.3A3.7 3.7 0 0 0 8 9.1c-.9 0-1.7.3-2.4.8L4.3 8.6A5.5 5.5 0 0 1 8 7.3Zm0-3.2c2.4 0 4.6 1 6.2 2.6L12.9 8A6.9 6.9 0 0 0 8 5.9 6.9 6.9 0 0 0 3.1 8L1.8 6.7A9 9 0 0 1 8 4.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function StatusBatteryIcon() {
  return (
    <svg className="phone-sys-icon phone-sys-battery" viewBox="0 0 25 12" aria-hidden="true">
      <rect
        x="0.75"
        y="1.75"
        width="20.5"
        height="8.5"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect x="2.5" y="3.4" width="12" height="5.2" rx="1" fill="currentColor" />
      <path d="M22.5 4.2h1.2c.7 0 1.3.6 1.3 1.3v1c0 .7-.6 1.3-1.3 1.3h-1.2V4.2Z" fill="currentColor" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 18 14" aria-hidden="true">
      <path
        d="M1 1.5h16M1 7h16M1 12.5h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m11 11 3.2 3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 5.2h9.6l-.7 8.1a1.2 1.2 0 0 1-1.2 1.1H5.1a1.2 1.2 0 0 1-1.2-1.1l-.7-8.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M5.4 5.2V4a2.6 2.6 0 0 1 5.2 0v1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function HomeTabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.5 9.2 10 3.5l6.5 5.7V16a1 1 0 0 1-1 1h-3.4v-4.2H7.9V17H4.5a1 1 0 0 1-1-1V9.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShopTabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 7.2h12l-1 8.3a1.2 1.2 0 0 1-1.2 1H6.2a1.2 1.2 0 0 1-1.2-1L4 7.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M7 7.2V5.6a3 3 0 0 1 6 0v1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SavedTabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M10 16.4 4.8 11.7a3.4 3.4 0 0 1 4.7-4.9L10 7.4l.5-.6a3.4 3.4 0 0 1 4.7 4.9L10 16.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountTabIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="7" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.2 16.2a5.8 5.8 0 0 1 11.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
