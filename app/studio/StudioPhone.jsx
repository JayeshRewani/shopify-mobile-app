import {
  BUY_BUTTON_SIZES,
  BUY_BUTTON_STYLES,
  fontFamily,
  inkOn,
  safeColor,
  sectionLabel,
} from "../design/tokens";
import { NavTabIcon } from "./NavIcons";

export function StudioPhone({
  design,
  collections = [],
  products = [],
  mode = "edit",
  view = "home",
  selectedId = "",
  activeTabId = "home",
  journeyLabel = "",
  onSelectSection,
  onOpenCollection,
  onOpenProduct,
  onTabChange,
}) {
  const colors = design.theme?.colors || {};
  const style = design.theme?.style || {};
  const primary = safeColor(colors.primary, "#6B0F2B");
  const paper = safeColor(colors.background, "#F8F4E8");
  const ink = safeColor(colors.text, "#0F0F10");
  const surface = safeColor(colors.surface, "#ffffff");
  const muted = safeColor(colors.muted, "#6B6560");
  const border = safeColor(colors.border, "#E6DFD2");
  const accent = safeColor(colors.accent, "#C4A4AD");
  const radius = Number(style.radius) || 12;
  const bannerRadius = Number(style.layout?.bannerRadius ?? 18) || 18;
  const cardRadius = Number(style.layout?.cardRadius ?? 16) || 16;
  const heading = fontFamily(design.theme?.typography?.headingFont);
  const body = fontFamily(design.theme?.typography?.bodyFont);
  const tabs = (design.navigation?.tabs || []).filter((tab) => tab.visible !== false);
  const interactive = mode === "try";

  const product =
    products.find(
      (entry) => entry.handle === design.productPage?.previewProductHandle,
    ) || products[0] || null;

  return (
    <div
      className="studio-phone"
      style={{
        "--sp-bg": paper,
        "--sp-ink": ink,
        "--sp-primary": primary,
        "--sp-surface": surface,
        "--sp-muted": muted,
        "--sp-border": border,
        "--sp-accent": accent,
        "--sp-radius": `${radius}px`,
        "--sp-heading": heading,
        "--sp-body": body,
      }}
    >
      <span className="studio-phone-side studio-phone-side-silent" aria-hidden="true" />
      <span className="studio-phone-side studio-phone-side-vol-up" aria-hidden="true" />
      <span className="studio-phone-side studio-phone-side-vol-down" aria-hidden="true" />
      <span className="studio-phone-side studio-phone-side-power" aria-hidden="true" />

      <div className="studio-phone-chassis">
        <div className="studio-phone-rim" aria-hidden="true" />
        <div className="studio-phone-screen">
          <div className="studio-phone-shine" aria-hidden="true" />
          <div className="studio-phone-island" aria-hidden="true">
            <span className="studio-phone-lens" />
          </div>

          <div className="studio-phone-status">
            <span className="studio-phone-time">9:41</span>
            <div className="studio-phone-status-icons" aria-hidden="true">
              <SignalIcon />
              <WifiIcon />
              <BatteryIcon />
            </div>
          </div>

          <div className="studio-phone-app">
            <header className="studio-phone-nav">
              {view !== "home" && journeyLabel ? (
                <button
                  className="studio-phone-icon-btn"
                  type="button"
                  onClick={() => onOpenCollection?.("")}
                  aria-label="Back"
                >
                  <BackIcon />
                </button>
              ) : (
                <span className="studio-phone-icon-btn" aria-hidden="true">
                  <MenuIcon />
                </span>
              )}
              {design.logoUrl ? (
                <img
                  className="studio-phone-brand-logo"
                  src={design.logoUrl}
                  alt={design.name}
                />
              ) : (
                <strong className="studio-phone-brand">{design.name}</strong>
              )}
              <div className="studio-phone-nav-actions" aria-hidden="true">
                <SearchIcon />
                <BagIcon />
              </div>
            </header>

            <div className="studio-phone-scroll">
              {view === "product" ? (
                <ProductView
                  product={product}
                  crop={design.productPage?.mediaCrop || "3:4"}
                  buyButtonStyle={design.productPage?.buyButtonStyle || "pill"}
                  buyButtonSize={design.productPage?.buyButtonSize || "comfortable"}
                  showWishlist={design.productPage?.showWishlist !== false}
                  primary={primary}
                  radius={radius}
                  cardRadius={cardRadius}
                  currency={design.currency}
                />
              ) : view === "collection" ? (
                <CollectionView
                  label={journeyLabel || "Collection"}
                  products={products}
                  primary={primary}
                  cardRadius={cardRadius}
                  onOpenProduct={interactive ? onOpenProduct : undefined}
                />
              ) : (
                <HomeView
                  design={design}
                  collections={collections}
                  selectedId={selectedId}
                  interactive={interactive}
                  bannerRadius={bannerRadius}
                  cardRadius={cardRadius}
                  primary={primary}
                  onSelectSection={onSelectSection}
                  onOpenCollection={onOpenCollection}
                  onOpenProduct={onOpenProduct}
                />
              )}
            </div>

            <nav className="studio-phone-tabs" aria-label="Bottom navigation">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={activeTabId === tab.id ? "is-active" : ""}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                >
                  <NavTabIcon name={tab.icon || tab.id} />
                  <span>{tab.label}</span>
                  {activeTabId === tab.id ? (
                    <i className="studio-phone-tab-mark" aria-hidden="true" />
                  ) : null}
                </button>
              ))}
            </nav>
            <div className="studio-phone-home-indicator" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

function HomeView({
  design,
  collections,
  selectedId,
  interactive,
  bannerRadius,
  cardRadius,
  primary,
  onSelectSection,
  onOpenCollection,
  onOpenProduct,
}) {
  if (!design.home?.length) {
    return (
      <div className="studio-phone-empty">
        Add a section to start designing your home screen.
      </div>
    );
  }

  return (
    <div className="studio-phone-home">
      {design.promo ? <div className="studio-phone-promo">{design.promo}</div> : null}
      {design.home.map((section) => {
        const selected = selectedId === section.id;
        const className = `studio-phone-block ${selected ? "is-selected" : ""}`;
        const select = () => onSelectSection?.(section.id);

        if (section.type === "banner") {
          const collection = collections.find(
            (entry) => entry.handle === section.collectionHandle,
          );
          const image =
            section.imageUrl ||
            collection?.image ||
            collection?.products?.[0]?.image ||
            collection?.products?.[1]?.image ||
            "";
          return (
            <button
              key={section.id}
              className={`${className} studio-phone-banner-wrap`}
              type="button"
              style={{
                borderRadius: bannerRadius,
                backgroundColor: primary,
              }}
              onClick={() => {
                if (interactive) onOpenCollection?.(section.collectionHandle, section.title);
                else select();
              }}
            >
              {image ? (
                <span
                  className="studio-phone-banner-media"
                  style={{ backgroundImage: `url(${JSON.stringify(image)})` }}
                  aria-hidden="true"
                />
              ) : (
                <span className="studio-phone-banner-media is-empty" aria-hidden="true" />
              )}
              <span className="studio-phone-banner-shade" aria-hidden="true" />
              <div className="studio-phone-banner">
                {section.eyebrow ? <span>{section.eyebrow}</span> : null}
                <strong>{section.title}</strong>
                {section.subtitle ? <em>{section.subtitle}</em> : null}
                <i style={{ borderRadius: 999 }}>{section.buttonLabel} →</i>
              </div>
            </button>
          );
        }

        if (section.type === "categories") {
          const chips = (section.handles || [])
            .map((handle) => collections.find((entry) => entry.handle === handle))
            .filter(Boolean);
          return (
            <div
              key={section.id}
              className={className}
              role="button"
              tabIndex={0}
              onClick={select}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") select();
              }}
            >
              <div className="studio-phone-section-head">
                <strong>{section.title || sectionLabel(section.type)}</strong>
              </div>
              <div className="studio-phone-chips">
                {(chips.length ? chips : [{ title: "All" }]).map((chip) => (
                  <span key={chip.handle || chip.title} style={{ borderRadius: cardRadius }}>
                    {chip.title}
                  </span>
                ))}
              </div>
            </div>
          );
        }

        const handle =
          section.type === "collection" ? section.handle : section.collectionHandle;
        const collection = collections.find((entry) => entry.handle === handle);
        const items = (collection?.products || []).slice(0, section.type === "collection" ? 3 : 4);

        return (
          <div
            key={section.id}
            className={className}
            role="button"
            tabIndex={0}
            onClick={select}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") select();
            }}
          >
            <div className="studio-phone-section-head">
              <strong>{section.title || sectionLabel(section.type)}</strong>
              <span>See all</span>
            </div>
            <div
              className={
                section.type === "collection"
                  ? "studio-phone-row"
                  : "studio-phone-grid"
              }
            >
              {(items.length ? items : [{ title: "Product", image: "" }]).map(
                (item, index) => (
                  <article
                    key={`${section.id}-${item.title}-${index}`}
                    className="studio-phone-card"
                    style={{ borderRadius: cardRadius }}
                    onClick={(event) => {
                      if (!interactive) return;
                      event.stopPropagation();
                      onOpenProduct?.(item);
                    }}
                  >
                    <div
                      className="studio-phone-card-media"
                      style={{
                        borderRadius: cardRadius,
                        backgroundImage: item.image
                          ? `url(${JSON.stringify(item.image)})`
                          : undefined,
                      }}
                    />
                    <strong>{item.title}</strong>
                  </article>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CollectionView({ label, products, primary, cardRadius, onOpenProduct }) {
  return (
    <div className="studio-phone-collection">
      <div
        className="studio-phone-collection-hero"
        style={{ background: primary, color: inkOn(primary) }}
      >
        <strong>{label}</strong>
        <p>Celebration-ready styles from your catalog.</p>
      </div>
      <div className="studio-phone-collection-meta">
        <span>{products.length || 0} products</span>
        <span>Sort: Featured</span>
      </div>
      <div className="studio-phone-grid">
        {(products.slice(0, 4).length
          ? products.slice(0, 4)
          : [{ title: "Product", price: "", image: "" }]
        ).map((product, index) => (
          <button
            key={`${product.handle || product.title}-${index}`}
            className="studio-phone-card studio-phone-card-btn"
            type="button"
            style={{ borderRadius: cardRadius }}
            onClick={() => onOpenProduct?.(product)}
          >
            <div
              className="studio-phone-card-media"
              style={{
                borderRadius: cardRadius,
                backgroundImage: product.image
                  ? `url(${JSON.stringify(product.image)})`
                  : undefined,
              }}
            />
            <strong>{product.title}</strong>
            <span>{formatMoney(product.price, product.currencyCode)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProductView({
  product,
  crop,
  buyButtonStyle = "pill",
  buyButtonSize = "comfortable",
  showWishlist = true,
  primary,
  radius,
  cardRadius,
  currency,
}) {
  const aspect =
    crop === "1:1" ? "1 / 1" : crop === "3:4" ? "3 / 4" : crop === "full" ? "4 / 5" : "4 / 5";
  const styleMeta =
    BUY_BUTTON_STYLES.find((entry) => entry.id === buyButtonStyle) || BUY_BUTTON_STYLES[2];
  const sizeMeta =
    BUY_BUTTON_SIZES.find((entry) => entry.id === buyButtonSize) || BUY_BUTTON_SIZES[1];
  const buttonRadius = styleMeta.radius > 40 ? 999 : styleMeta.radius;

  return (
    <div className="studio-phone-product">
      <div
        className="studio-phone-product-media"
        style={{
          aspectRatio: aspect,
          borderRadius: cardRadius,
          backgroundImage: product?.image
            ? `url(${JSON.stringify(product.image)})`
            : undefined,
        }}
      />
      <div className="studio-phone-product-copy">
        <strong>{product?.title || "Product title"}</strong>
        <p>{product?.description || "Product details appear here from your catalog."}</p>
        <em>{formatMoney(product?.price, product?.currencyCode || currency)}</em>
      </div>
      <div className="studio-phone-size">
        <div>
          <strong>Size</strong>
          <span>Size guide</span>
        </div>
        <div className="studio-phone-size-row">
          {["XS", "S", "M", "L", "XL"].map((size) => (
            <span
              key={size}
              className={size === "M" ? "is-active" : ""}
              style={{
                borderRadius: radius > 20 ? 999 : radius,
                background: size === "M" ? primary : "transparent",
                color: size === "M" ? inkOn(primary) : "inherit",
              }}
            >
              {size}
            </span>
          ))}
        </div>
      </div>
      <div
        className={`studio-phone-buy-row ${showWishlist ? "" : "is-full"}`}
        style={{ minHeight: sizeMeta.height }}
      >
        <button
          className="studio-phone-buy"
          type="button"
          style={{
            background: primary,
            color: inkOn(primary),
            borderRadius: buttonRadius,
            minHeight: sizeMeta.height,
            fontSize: sizeMeta.fontSize,
          }}
        >
          Add to bag
        </button>
        {showWishlist ? (
          <span
            className="studio-phone-heart"
            aria-hidden="true"
            style={{
              borderRadius: buttonRadius > 40 ? 14 : Math.min(buttonRadius, 14),
              minHeight: sizeMeta.height,
              width: sizeMeta.height,
            }}
          >
            ♡
          </span>
        ) : null}
      </div>
    </div>
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

function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" aria-hidden="true">
      <rect x="0" y="8" width="3" height="4" rx="0.6" fill="currentColor" />
      <rect x="5" y="5" width="3" height="7" rx="0.6" fill="currentColor" />
      <rect x="10" y="2.5" width="3" height="9.5" rx="0.6" fill="currentColor" />
      <rect x="15" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 16 12" aria-hidden="true">
      <path
        d="M8 10.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm0-3.3c1.5 0 2.9.6 3.9 1.6l-1.3 1.3A3.7 3.7 0 0 0 8 9.1c-.9 0-1.7.3-2.4.8L4.3 8.6A5.5 5.5 0 0 1 8 7.3Zm0-3.2c2.4 0 4.6 1 6.2 2.6L12.9 8A6.9 6.9 0 0 0 8 5.9 6.9 6.9 0 0 0 3.1 8L1.8 6.7A9 9 0 0 1 8 4.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 25 12" aria-hidden="true">
      <rect x="0.75" y="1.75" width="20.5" height="8.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="3.4" width="12" height="5.2" rx="1" fill="currentColor" />
      <path d="M22.5 4.2h1.2c.7 0 1.3.6 1.3 1.3v1c0 .7-.6 1.3-1.3 1.3h-1.2V4.2Z" fill="currentColor" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 18 14" aria-hidden="true">
      <path d="M1 1.5h16M1 7h16M1 12.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10 3 4.5 8 10 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
      <path d="M3.2 5.2h9.6l-.7 8.1a1.2 1.2 0 0 1-1.2 1.1H5.1a1.2 1.2 0 0 1-1.2-1.1l-.7-8.1Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 5.2V4a2.6 2.6 0 0 1 5.2 0v1.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

