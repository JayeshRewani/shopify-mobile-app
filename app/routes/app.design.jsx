import { useEffect, useMemo, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ensureShopCredentials } from "../services/shop-sync.server";
import {
  designForEditor,
  loadDesignCollections,
  loadDesignMedia,
  loadDesignProducts,
  loadShopBrandLogo,
  validateDesign,
} from "../services/design.server";
import {
  BRAND_COLOR_KEYS,
  BRAND_COLOR_LABELS,
  BUY_BUTTON_SIZES,
  BUY_BUTTON_STYLES,
  DESIGN_FONT_LABELS,
  DESIGN_FONTS,
  PRODUCT_CROPS,
  STUDIO_SCREENS,
  designFingerprint,
  fontFamily,
  isHex,
  sectionLabel,
} from "../design/tokens";
import { StudioPhone } from "../studio/StudioPhone";
import { NAV_ICONS, NavTabIcon } from "../studio/NavIcons";
import "../styles/studio.css";

const BLOCKS = [
  {
    type: "banner",
    title: "Banner",
    hint: "Hero image, heading, and a tap destination",
    icon: "banner",
  },
  {
    type: "categories",
    title: "Categories",
    hint: "Quick links to collections",
    icon: "categories",
  },
  {
    type: "collection",
    title: "Collection row",
    hint: "Horizontal product cards",
    icon: "collection",
  },
  {
    type: "productGrid",
    title: "Product grid",
    hint: "Two-column product grid",
    icon: "grid",
  },
];

const PRODUCT_PARTS = [
  { id: "media", title: "Product media", detail: "Crop and preview image" },
  { id: "price", title: "Price", detail: "How price appears under the title" },
  { id: "size", title: "Size selector", detail: "Size chips and guide link" },
  { id: "buy", title: "Buy button", detail: "Add to bag and wishlist" },
];

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const config = await ensureShopCredentials({ admin, shop: session.shop });
  const [collections, products, media, shopBrandLogo] = await Promise.all([
    loadDesignCollections(admin),
    loadDesignProducts(admin),
    loadDesignMedia(admin),
    loadShopBrandLogo({
      shop: config.shop,
      storefrontAccessToken: config.storefrontAccessToken,
    }),
  ]);
  const context = {
    shop: config.shop,
    shopName: config.shopName,
    currencyCode: config.currencyCode,
  };
  return {
    design: designForEditor(config.draftDesign, context),
    publishedDesign: config.publishedDesign,
    collections,
    products,
    media,
    shopBrandLogo,
    shopName: config.shopName,
    updatedAt: config.updatedAt || config.syncedAt || null,
  };
};

export function shouldRevalidate({ actionResult, defaultShouldRevalidate }) {
  // Draft autosave must not reload media/collections on every keystroke save.
  if (actionResult && typeof actionResult === "object" && actionResult.intent === "draft") {
    return false;
  }
  return defaultShouldRevalidate;
}

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const config = await ensureShopCredentials({ admin, shop: session.shop });
  const [collections, shopBrandLogo] = await Promise.all([
    loadDesignCollections(admin),
    loadShopBrandLogo({
      shop: config.shop,
      storefrontAccessToken: config.storefrontAccessToken,
    }),
  ]);
  const incoming = { ...(body.design || {}) };
  if (incoming.logoUrl == null && shopBrandLogo) {
    incoming.logoUrl = shopBrandLogo;
  }
  const result = validateDesign(incoming, {
    shop: config.shop,
    shopName: config.shopName,
    currencyCode: config.currencyCode,
    handles: new Set(collections.map((collection) => collection.handle)),
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const intent = body.intent === "publish" ? "publish" : "draft";
  const data =
    intent === "publish"
      ? { draftDesign: result.design, publishedDesign: result.design }
      : { draftDesign: result.design };

  await db.shopConfig.update({ where: { shop: config.shop }, data });
  return { ok: true, intent, design: result.design, savedAt: new Date().toISOString() };
};

export default function DesignPage() {
  const loaded = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [design, setDesign] = useState(loaded.design);
  const [published, setPublished] = useState(loaded.publishedDesign);
  const [studioScreen, setStudioScreen] = useState("home");
  const [mode, setMode] = useState("edit");
  const [selectedId, setSelectedId] = useState(loaded.design.home[0]?.id || "");
  const [productPart, setProductPart] = useState("media");
  const [navOpenId, setNavOpenId] = useState("shop");
  const [phoneView, setPhoneView] = useState("home");
  const [journey, setJourney] = useState([{ id: "home", label: "Home screen" }]);
  const [activeTabId, setActiveTabId] = useState("home");
  const [savedAt, setSavedAt] = useState(loaded.updatedAt);
  const [showAdd, setShowAdd] = useState(false);
  const autosaveRef = useRef(designFingerprint(loaded.design));
  const skipAutosaveRef = useRef(true);
  const needsResaveRef = useRef(false);
  const lastHandledSaveRef = useRef("");
  const toastIntentRef = useRef("");
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const designRef = useRef(design);
  designRef.current = design;

  const saving = fetcher.state !== "idle";
  const error = fetcher.data?.ok === false ? fetcher.data.error : "";
  const live = designFingerprint(design) === designFingerprint(published);
  const selected = design.home.find((section) => section.id === selectedId) || null;
  const screenMeta = STUDIO_SCREENS.find((screen) => screen.id === studioScreen) || STUDIO_SCREENS[0];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (fetcher.state !== "idle") return;

    const saveToken = String(fetcher.data?.savedAt || "");
    if (fetcher.data?.ok && saveToken && lastHandledSaveRef.current !== saveToken) {
      lastHandledSaveRef.current = saveToken;
      if (fetcher.data.intent === "publish" && fetcher.data.design) {
        setPublished(fetcher.data.design);
        setDesign(fetcher.data.design);
        autosaveRef.current = designFingerprint(fetcher.data.design);
      }
      if (fetcher.data.savedAt) setSavedAt(fetcher.data.savedAt);
      if (toastIntentRef.current) {
        shopify.toast.show(
          fetcher.data.intent === "publish" ? "Published to live app" : "Draft saved",
        );
        toastIntentRef.current = "";
      }
    }

    if (!needsResaveRef.current) return;
    needsResaveRef.current = false;
    const latest = designFingerprint(designRef.current);
    if (latest === autosaveRef.current) return;
    autosaveRef.current = latest;
    fetcherRef.current.submit(
      { intent: "draft", design: designRef.current },
      { method: "POST", encType: "application/json" },
    );
  }, [fetcher.state, fetcher.data, shopify]);

  useEffect(() => {
    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    const fingerprint = designFingerprint(design);
    if (fingerprint === autosaveRef.current) return;

    const timer = setTimeout(() => {
      const latest = designFingerprint(designRef.current);
      if (latest === autosaveRef.current) return;
      if (fetcherRef.current.state !== "idle") {
        needsResaveRef.current = true;
        return;
      }
      autosaveRef.current = latest;
      fetcherRef.current.submit(
        { intent: "draft", design: designRef.current },
        { method: "POST", encType: "application/json" },
      );
    }, 1200);

    return () => clearTimeout(timer);
  }, [design]);

  const save = (intent) => {
    toastIntentRef.current = intent;
    needsResaveRef.current = false;
    const fingerprint = designFingerprint(design);
    autosaveRef.current = fingerprint;
    fetcher.submit(
      { intent, design },
      { method: "POST", encType: "application/json" },
    );
  };

  const addSection = (type) => {
    const handle = loaded.collections[0]?.handle || "";
    if (!handle) return;
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
    const defaultImage =
      loaded.media.find((item) => item.source === "collection")?.url ||
      loaded.media.find((item) => item.source === "files")?.url ||
      loaded.media[0]?.url ||
      loaded.collections[0]?.image ||
      loaded.collections[0]?.products?.[0]?.image ||
      "";
    const section =
      type === "banner"
        ? {
            type,
            id,
            eyebrow: design.name,
            title: "Festive Edit",
            subtitle: "Shop this collection.",
            buttonLabel: "Shop now",
            collectionHandle: handle,
            imageUrl: defaultImage,
          }
        : type === "categories"
          ? { type, id, title: "Shop", handles: [handle] }
          : type === "collection"
            ? { type, id, title: "New arrivals", handle }
            : { type, id, title: "Featured collection", collectionHandle: handle };
    setDesign({ ...design, home: [...design.home, section] });
    setSelectedId(id);
    setShowAdd(false);
    setStudioScreen("home");
    setMode("edit");
    setPhoneView("home");
  };

  const updateSection = (next) => {
    setDesign({
      ...design,
      home: design.home.map((section) => (section.id === next.id ? next : section)),
    });
  };

  const moveSection = (id, direction) => {
    const index = design.home.findIndex((section) => section.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= design.home.length) return;
    const home = design.home.slice();
    const [section] = home.splice(index, 1);
    home.splice(next, 0, section);
    setDesign({ ...design, home });
  };

  const removeSection = (id) => {
    const home = design.home.filter((section) => section.id !== id);
    setDesign({ ...design, home });
    if (selectedId === id) setSelectedId(home[0]?.id || "");
  };

  const openCollection = (handle, title) => {
    const collection = loaded.collections.find((entry) => entry.handle === handle);
    const label = title || collection?.title || "Collection";
    setPhoneView("collection");
    setJourney([
      { id: "home", label: "Home screen", done: true },
      { id: "collection", label, done: false },
    ]);
    setActiveTabId("shop");
  };

  const openProduct = (product) => {
    if (product?.handle) {
      setDesign((current) => ({
        ...current,
        productPage: {
          ...current.productPage,
          previewProductHandle: product.handle,
        },
      }));
    }
    setPhoneView("product");
    if (mode !== "try") setStudioScreen("product");
    setJourney((current) => {
      const base = (current.length ? current : [{ id: "home", label: "Home screen" }]).map(
        (step) => ({ ...step, done: true }),
      );
      return [
        ...base.slice(0, 2),
        {
          id: "product",
          label: product?.title || "Product",
          done: false,
        },
      ];
    });
  };

  const bodyClass = useMemo(() => {
    if (mode === "try") return "studio-body is-try";
    if (studioScreen === "brand") return "studio-body is-brand";
    if (studioScreen === "navigation") return "studio-body is-navigation";
    return "studio-body";
  }, [mode, studioScreen]);

  const previewDesign = useMemo(
    () => ({
      ...design,
      logoUrl:
        design.logoUrl == null
          ? loaded.shopBrandLogo || ""
          : design.logoUrl || "",
    }),
    [design, loaded.shopBrandLogo],
  );

  return (
    <div className="studio">
      <header className="studio-top">
        <div className="studio-top-left">
          <p className="studio-crumb">App design · {screenMeta.label}</p>
          <h1>{screenMeta.label}</h1>
          <p>{screenMeta.detail}</p>
        </div>
        <div className="studio-top-right">
          <select
            className="studio-screen-select"
            value={studioScreen}
            onChange={(event) => {
              setStudioScreen(event.target.value);
              setMode("edit");
              setPhoneView(event.target.value === "product" ? "product" : "home");
              if (event.target.value === "navigation") {
                setActiveTabId(navOpenId || "shop");
              }
            }}
            aria-label="Choose studio screen"
          >
            {STUDIO_SCREENS.map((screen) => (
              <option key={screen.id} value={screen.id}>
                {screen.label}
              </option>
            ))}
          </select>

          <div className="studio-mode" role="tablist" aria-label="Editor mode">
            <button
              className={mode === "edit" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setMode("edit");
                setPhoneView(studioScreen === "product" ? "product" : "home");
              }}
            >
              Edit
            </button>
            <button
              className={mode === "try" ? "is-active" : ""}
              type="button"
              onClick={() => {
                setMode("try");
                setPhoneView("home");
                setJourney([{ id: "home", label: "Home screen" }]);
                setActiveTabId("home");
              }}
            >
              Try app
            </button>
          </div>

          <span className={`studio-status ${live ? "" : "is-dirty"}`}>
            <i />
            {saving
              ? "Saving…"
              : live
                ? `Up to date${savedAt ? ` · ${formatClock(savedAt)}` : ""}`
                : `Draft saved${savedAt ? ` · ${formatClock(savedAt)}` : ""} · not live`}
          </span>

          <button
            className="studio-btn-ghost"
            type="button"
            onClick={() => save("draft")}
            disabled={saving}
          >
            Save draft
          </button>
          <button
            className="studio-btn-primary"
            type="button"
            onClick={() => save("publish")}
            disabled={saving}
          >
            {live ? "Publish to live app" : "Review & publish"}
          </button>
        </div>
      </header>

      {error ? <p className="studio-error">{error}</p> : null}

      <div className={bodyClass}>
        {mode === "edit" && studioScreen === "navigation" ? (
          <>
            <div className="studio-nav-banner">
              <div className="studio-alert">
                <span aria-hidden="true">✓</span>
                <span>
                  {(design.navigation?.tabs || []).filter((tab) => tab.visible !== false).length}{" "}
                  destinations: Your bottom navigation is set up and ready.
                </span>
              </div>
            </div>
            <section className="studio-canvas" aria-label="App preview">
              <div className={`studio-canvas-label ${live ? "" : "is-draft"}`}>
                <i />
                {live ? "Live preview" : "Draft preview"}
              </div>
              <StudioPhone
                design={previewDesign}
                collections={loaded.collections}
                products={loaded.products}
                mode={mode}
                view={phoneView}
                selectedId=""
                activeTabId={activeTabId}
                journeyLabel={journey[journey.length - 1]?.label || ""}
                onSelectSection={(id) => {
                  setSelectedId(id);
                  setStudioScreen("home");
                  setMode("edit");
                }}
                onOpenCollection={openCollection}
                onOpenProduct={openProduct}
                onTabChange={(id) => {
                  setActiveTabId(id);
                  setNavOpenId(id);
                  if (id === "home") {
                    setPhoneView("home");
                    setJourney([{ id: "home", label: "Home screen" }]);
                  }
                  if (id === "shop") {
                    setPhoneView("collection");
                    setJourney([
                      { id: "home", label: "Home screen", done: true },
                      { id: "collection", label: "Shop", done: false },
                    ]);
                  }
                }}
              />
            </section>
            <NavigationPanel
              design={design}
              openId={navOpenId}
              onOpen={(id) => {
                setNavOpenId(id);
                if (id) setActiveTabId(id);
              }}
              onChange={(navigation) => setDesign({ ...design, navigation })}
            />
          </>
        ) : (
          <>
        {mode === "try" ? (
          <TryPanel
            journey={journey}
            onReset={() => {
              setPhoneView("home");
              setJourney([{ id: "home", label: "Home screen" }]);
              setActiveTabId("home");
            }}
          />
        ) : studioScreen === "home" ? (
          <HomeSectionsPanel
            design={design}
            selectedId={selectedId}
            showAdd={showAdd}
            collectionsEmpty={!loaded.collections.length}
            onSelect={setSelectedId}
            onToggleAdd={() => setShowAdd((value) => !value)}
            onAdd={addSection}
            onMove={moveSection}
          />
        ) : studioScreen === "product" ? (
          <ProductPartsPanel
            productPart={productPart}
            onSelect={setProductPart}
          />
        ) : (
          <BrandPanel
            design={design}
            media={loaded.media}
            shopBrandLogo={loaded.shopBrandLogo || ""}
            onChange={setDesign}
          />
        )}

        <section className="studio-canvas" aria-label="App preview">
          <div className={`studio-canvas-label ${live ? "" : "is-draft"}`}>
            <i />
            {live ? "Live preview" : "Draft preview"}
          </div>
          <StudioPhone
            design={previewDesign}
            collections={loaded.collections}
            products={loaded.products}
            mode={mode}
            view={phoneView}
            selectedId={mode === "edit" && studioScreen === "home" ? selectedId : ""}
            activeTabId={activeTabId}
            journeyLabel={journey[journey.length - 1]?.label || ""}
            onSelectSection={(id) => {
              setSelectedId(id);
              setStudioScreen("home");
              setMode("edit");
            }}
            onOpenCollection={openCollection}
            onOpenProduct={openProduct}
            onTabChange={(id) => {
              setActiveTabId(id);
              if (id === "home") {
                setPhoneView("home");
                setJourney([{ id: "home", label: "Home screen" }]);
              }
              if (id === "shop") {
                setPhoneView("collection");
                setJourney([
                  { id: "home", label: "Home screen", done: true },
                  { id: "collection", label: "Shop", done: false },
                ]);
              }
            }}
          />
        </section>

        {mode === "edit" && studioScreen === "home" ? (
          <aside className="studio-panel">
            <div className="studio-panel-head">
              <div>
                <h2>{selected ? sectionLabel(selected.type) : "Section"}</h2>
                <p>
                  {selected
                    ? "Changes update the phone preview instantly."
                    : "Select a section on the left or in the phone."}
                </p>
              </div>
            </div>
            <div className="studio-panel-scroll">
              {selected ? (
                <SectionInspector
                  section={selected}
                  collections={loaded.collections}
                  media={loaded.media}
                  onChange={updateSection}
                  onDelete={() => removeSection(selected.id)}
                />
              ) : (
                <p className="merchant-helper">
                  Add a banner, then click it in the preview to edit heading and tap destination.
                </p>
              )}
            </div>
          </aside>
        ) : null}

        {mode === "edit" && studioScreen === "product" ? (
          <aside className="studio-panel">
            <div className="studio-panel-head">
              <div>
                <h2>
                  {PRODUCT_PARTS.find((part) => part.id === productPart)?.title ||
                    "Product page"}
                </h2>
                <p>Customize how product details look in your mobile app.</p>
              </div>
            </div>
            <div className="studio-panel-scroll">
              <ProductInspector
                design={design}
                products={loaded.products}
                productPart={productPart}
                onChange={setDesign}
              />
            </div>
          </aside>
        ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function HomeSectionsPanel({
  design,
  selectedId,
  showAdd,
  collectionsEmpty,
  onSelect,
  onToggleAdd,
  onAdd,
  onMove,
}) {
  return (
    <aside className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <h2>Sections</h2>
          <p>Design and arrange the home screen.</p>
        </div>
        <button className="studio-btn-ghost" type="button" onClick={onToggleAdd}>
          {showAdd ? "Close" : "+ Add section"}
        </button>
      </div>
      <div className="studio-panel-scroll">
        {showAdd ? (
          <div className="studio-add-panel">
            <div className="studio-add-panel-head">
              <strong>Add a section</strong>
              <p>Choose a block customers will see on the home screen.</p>
            </div>
            <div className="studio-add-grid">
              {BLOCKS.map((block) => (
                <button
                  key={block.type}
                  className="studio-add-card"
                  type="button"
                  disabled={collectionsEmpty}
                  onClick={() => onAdd(block.type)}
                >
                  <span className={`studio-add-icon is-${block.icon}`} aria-hidden="true" />
                  <span className="studio-add-copy">
                    <strong>{block.title}</strong>
                    <span>{block.hint}</span>
                  </span>
                  <span className="studio-add-plus">Add</span>
                </button>
              ))}
            </div>
            {collectionsEmpty ? (
              <p className="merchant-helper">
                Add a collection in Shopify before building the home screen.
              </p>
            ) : (
              <p className="merchant-helper">
                Tip: start with a Banner, then add a collection row for products.
              </p>
            )}
          </div>
        ) : null}

        <ol className="studio-section-list">
          {design.home.map((section, index) => (
            <li key={section.id} className="studio-section-row">
              <button
                className={`studio-section-item ${selectedId === section.id ? "is-selected" : ""}`}
                type="button"
                onClick={() => onSelect(section.id)}
              >
                <span className="studio-handle" aria-hidden="true">
                  ::
                </span>
                <span>
                  <strong>{section.title || sectionLabel(section.type)}</strong>
                  <span>{sectionLabel(section.type)}</span>
                </span>
                {selectedId === section.id ? (
                  <span className="studio-pill">Selected</span>
                ) : (
                  <span aria-hidden="true">›</span>
                )}
              </button>
              <div className="studio-inline-actions">
                <button
                  type="button"
                  onClick={() => onMove(section.id, -1)}
                  disabled={index === 0}
                  aria-label="Move section up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => onMove(section.id, 1)}
                  disabled={index === design.home.length - 1}
                  aria-label="Move section down"
                >
                  ↓
                </button>
              </div>
            </li>
          ))}
        </ol>
        {!design.home.length && !showAdd ? (
          <div className="studio-empty-sections">
            <strong>No sections yet</strong>
            <p>Add a banner so customers see a clear first impression.</p>
            <button className="studio-btn-primary" type="button" onClick={onToggleAdd}>
              + Add section
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ProductPartsPanel({ productPart, onSelect }) {
  return (
    <aside className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <h2>Product page</h2>
          <p>Customize how product details look in your mobile app.</p>
        </div>
      </div>
      <div className="studio-panel-scroll">
        <div className="studio-section-list">
          {PRODUCT_PARTS.map((part) => (
            <button
              key={part.id}
              className={`studio-part-item ${productPart === part.id ? "is-selected" : ""}`}
              type="button"
              onClick={() => onSelect(part.id)}
            >
              <span className="studio-handle" aria-hidden="true">
                ::
              </span>
              <span>
                <strong>{part.title}</strong>
                <span>{part.detail}</span>
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function ProductInspector({ design, products, productPart, onChange }) {
  const productPage = design.productPage || {};
  const setProductPage = (patch) =>
    onChange({ ...design, productPage: { ...productPage, ...patch } });

  if (productPart === "media") {
    return (
      <div className="studio-fields">
        <div className="studio-field">
          <span>Crop</span>
          <small>Choose how product media fills the phone.</small>
          <div className="studio-choice-grid">
            {PRODUCT_CROPS.map((crop) => (
              <button
                key={crop.id}
                className={`studio-choice ${productPage.mediaCrop === crop.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setProductPage({ mediaCrop: crop.id })}
              >
                <strong>{crop.label}</strong>
              </button>
            ))}
          </div>
        </div>
        <label className="studio-field">
          Preview product
          <small>Choose which product this preview shows.</small>
          <select
            value={productPage.previewProductHandle || products[0]?.handle || ""}
            onChange={(event) =>
              setProductPage({ previewProductHandle: event.target.value })
            }
          >
            {products.map((product) => (
              <option key={product.handle} value={product.handle}>
                {product.title}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (productPart === "buy") {
    const buttonStyle = productPage.buyButtonStyle || "pill";
    const buttonSize = productPage.buyButtonSize || "comfortable";
    return (
      <div className="studio-fields">
        <div className="studio-field">
          <span>Button style</span>
          <small>Corner shape for Add to bag.</small>
          <div className="studio-choice-grid">
            {BUY_BUTTON_STYLES.map((style) => (
              <button
                key={style.id}
                className={`studio-choice ${buttonStyle === style.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setProductPage({ buyButtonStyle: style.id })}
              >
                <strong>{style.label}</strong>
                <span
                  className="studio-choice-swatch"
                  style={{ borderRadius: style.radius > 40 ? 999 : style.radius }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="studio-field">
          <span>Button size</span>
          <small>Height and tap target on the product page.</small>
          <div className="studio-choice-grid studio-choice-grid-3">
            {BUY_BUTTON_SIZES.map((size) => (
              <button
                key={size.id}
                className={`studio-choice ${buttonSize === size.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setProductPage({ buyButtonSize: size.id })}
              >
                <strong>{size.label}</strong>
                <span>{size.height}px</span>
              </button>
            ))}
          </div>
        </div>

        <label className="studio-field studio-check-row">
          <input
            type="checkbox"
            checked={productPage.showWishlist !== false}
            onChange={(event) =>
              setProductPage({ showWishlist: event.target.checked })
            }
          />
          <span>
            Show wishlist heart
            <small style={{ display: "block", fontWeight: 400 }}>
              Sits beside the buy button in the phone preview.
            </small>
          </span>
        </label>

        <p className="merchant-helper">
          Button color still comes from your brand primary in Colors & logo.
        </p>
      </div>
    );
  }

  return (
    <div className="studio-fields">
      <p className="merchant-helper">
        {productPart === "price"
          ? "Price uses your Shopify catalog amount and currency automatically."
          : "Size chips mirror a standard apparel selector for preview. Live sizes come from product variants."}
      </p>
    </div>
  );
}

function NavigationPanel({ design, openId, onOpen, onChange }) {
  const tabs = design.navigation?.tabs || [];
  const dragIndexRef = useRef(null);

  const updateTab = (id, patch) => {
    onChange({
      tabs: tabs.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    });
  };

  const reorderTabs = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= tabs.length || toIndex >= tabs.length) return;
    const next = [...tabs];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onChange({ tabs: next });
  };

  return (
    <aside className="studio-panel studio-panel-destinations">
      <div className="studio-panel-head">
        <div>
          <h2>Destinations</h2>
          <p>Choose, edit, and reorder the tabs in your bottom navigation.</p>
        </div>
      </div>
      <div className="studio-panel-scroll">
        <div className="studio-dest-list">
          {tabs.map((tab, index) => {
            const open = openId === tab.id;
            return (
              <div
                key={tab.id}
                className={`studio-dest-card ${open ? "is-open" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  reorderTabs(dragIndexRef.current, index);
                  dragIndexRef.current = null;
                }}
              >
                <button
                  type="button"
                  className="studio-dest-row"
                  onClick={() => onOpen(open ? "" : tab.id)}
                  aria-expanded={open}
                >
                  <span
                    className="studio-handle"
                    aria-hidden="true"
                    title="Drag to reorder"
                    draggable
                    onClick={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      dragIndexRef.current = index;
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="studio-dest-icon" aria-hidden="true">
                    <NavTabIcon name={tab.icon || tab.id} />
                  </span>
                  <span className="studio-dest-copy">
                    <strong>{tab.label}</strong>
                    <span>{tab.destination}</span>
                  </span>
                  {tab.visible !== false ? (
                    <span className="studio-pill">Visible</span>
                  ) : (
                    <span className="studio-pill is-muted">Hidden</span>
                  )}
                  <span className={`studio-dest-chevron ${open ? "is-open" : ""}`} aria-hidden="true">
                    ›
                  </span>
                </button>

                {open ? (
                  <div className="studio-dest-editor">
                    <label className="studio-field">
                      Label
                      <input
                        type="text"
                        maxLength={12}
                        value={tab.label}
                        onChange={(event) =>
                          updateTab(tab.id, { label: event.target.value.slice(0, 12) })
                        }
                      />
                      <span className="studio-char">{tab.label.length}/12</span>
                    </label>
                    <label className="studio-field">
                      Icon
                      <select
                        value={tab.icon || tab.id}
                        onChange={(event) => updateTab(tab.id, { icon: event.target.value })}
                      >
                        {NAV_ICONS.map((icon) => (
                          <option key={icon.id} value={icon.id}>
                            {icon.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function BrandPanel({ design, media = [], shopBrandLogo = "", onChange }) {
  const colors = design.theme.colors;
  const typography = design.theme.typography;
  const [pickingLogo, setPickingLogo] = useState(false);
  const logoUrl =
    design.logoUrl == null ? shopBrandLogo || "" : design.logoUrl || "";
  const usingShopifyBrand =
    design.logoUrl == null
      ? Boolean(shopBrandLogo)
      : Boolean(shopBrandLogo && design.logoUrl === shopBrandLogo);

  const setThemePatch = (patch) =>
    onChange({
      ...design,
      theme: {
        ...design.theme,
        ...patch,
        colors: patch.colors ? { ...colors, ...patch.colors } : colors,
        typography: patch.typography
          ? { ...typography, ...patch.typography }
          : typography,
      },
    });

  return (
    <aside className="studio-panel studio-panel-brand">
      <div className="studio-panel-head">
        <div>
          <h2>Colors & logo</h2>
          <p>Brand signals that carry across every screen.</p>
        </div>
      </div>
      <div className="studio-panel-scroll">
        <div className="studio-brand-stack">
          <section className="studio-brand-card">
            <div className="studio-brand-card-head">
              <strong>Brand logo</strong>
              <p>Upload your wordmark. It will be used in the app header, launch screen, and other key places.</p>
            </div>
            <div
              className={`studio-logo-preview ${logoUrl ? "has-image" : ""}`}
              style={{ background: colors.background || "#F8F4E8" }}
            >
              {logoUrl ? (
                <img src={logoUrl} alt={`${design.name} logo`} />
              ) : (
                <span style={{ fontFamily: fontFamily(typography.headingFont) }}>
                  {design.name}
                </span>
              )}
            </div>
            <p className="merchant-helper">
              {usingShopifyBrand
                ? "Using your Shopify brand logo by default. Replace it anytime from Content → Files."
                : "Wordmark (PNG or SVG). Recommended: transparent background, at least 1200 × 400 px."}
            </p>
            <div className="studio-logo-actions">
              <button
                className="studio-btn-ghost"
                type="button"
                onClick={() => setPickingLogo((value) => !value)}
              >
                {pickingLogo ? "Close" : logoUrl ? "Replace" : "Upload"}
              </button>
              {logoUrl ? (
                <button
                  className="studio-btn-ghost is-danger"
                  type="button"
                  onClick={() => onChange({ ...design, logoUrl: "" })}
                >
                  Remove
                </button>
              ) : null}
              {shopBrandLogo && design.logoUrl && design.logoUrl !== shopBrandLogo ? (
                <button
                  className="studio-btn-ghost"
                  type="button"
                  onClick={() => onChange({ ...design, logoUrl: shopBrandLogo })}
                >
                  Use Shopify brand
                </button>
              ) : null}
            </div>
            {pickingLogo ? (
              <div className="studio-logo-picker">
                <BannerMediaPicker
                  media={
                    media.some((item) => item.source === "files")
                      ? media.filter((item) => item.source === "files")
                      : media
                  }
                  selectedUrl={logoUrl}
                  onSelect={(url) => {
                    onChange({ ...design, logoUrl: url });
                    setPickingLogo(false);
                  }}
                />
              </div>
            ) : null}
          </section>

          <section className="studio-brand-card">
            <div className="studio-brand-card-head">
              <strong>App colors</strong>
              <p>Define your brand palette. We’ll apply these colors across buttons, text, and backgrounds.</p>
            </div>
            <div className="studio-color-list studio-color-list-brand">
              {BRAND_COLOR_KEYS.map((key) => (
                <label key={key} className="studio-color-row">
                  <input
                    type="color"
                    value={isHex(colors[key]) ? colors[key] : "#111111"}
                    onChange={(event) => {
                      const next = event.target.value.toUpperCase();
                      setThemePatch({
                        colors: {
                          [key]: next,
                          ...(key === "primary" ? { accent: next, sale: next } : {}),
                        },
                      });
                    }}
                  />
                  <span>
                    <strong>{BRAND_COLOR_LABELS[key]}</strong>
                    <small>{colors[key]}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="studio-brand-card">
            <div className="studio-brand-card-head">
              <strong>Typography</strong>
              <p>Choose the type styles for key text in your app.</p>
            </div>
            <div className="studio-font-grid">
              <label className="studio-field">
                Headings
                <select
                  value={
                    DESIGN_FONTS.includes(typography.headingFont)
                      ? typography.headingFont
                      : "Playfair"
                  }
                  onChange={(event) =>
                    setThemePatch({ typography: { headingFont: event.target.value } })
                  }
                >
                  {DESIGN_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {DESIGN_FONT_LABELS[font] || font}
                    </option>
                  ))}
                </select>
                <span
                  className="studio-font-sample"
                  style={{ fontFamily: fontFamily(typography.headingFont) }}
                >
                  Aa Bb Cc 123
                </span>
              </label>
              <label className="studio-field">
                Body & UI
                <select
                  value={
                    DESIGN_FONTS.includes(typography.bodyFont)
                      ? typography.bodyFont
                      : "DM Sans"
                  }
                  onChange={(event) =>
                    setThemePatch({ typography: { bodyFont: event.target.value } })
                  }
                >
                  {DESIGN_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {DESIGN_FONT_LABELS[font] || font}
                    </option>
                  ))}
                </select>
                <span
                  className="studio-font-sample"
                  style={{ fontFamily: fontFamily(typography.bodyFont) }}
                >
                  Aa Bb Cc 123
                </span>
              </label>
            </div>
          </section>

          <label className="studio-field">
            Tagline
            <input
              type="text"
              value={design.tagline || ""}
              onChange={(event) => onChange({ ...design, tagline: event.target.value })}
            />
          </label>
        </div>
      </div>
    </aside>
  );
}

function TryPanel({ journey, onReset }) {
  return (
    <aside className="studio-panel">
      <div className="studio-panel-head">
        <div>
          <h2>Test a shopping journey</h2>
          <p>Tap through the phone to verify navigation before publishing.</p>
        </div>
        <button className="studio-btn-ghost" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="studio-panel-scroll">
        <ol className="studio-journey">
          {journey.map((step, index) => {
            const current = index === journey.length - 1;
            return (
              <li
                key={`${step.id}-${step.label}-${index}`}
                className={`studio-journey-item ${step.done ? "is-done" : ""} ${current ? "is-current" : ""}`}
              >
                <span className="studio-journey-mark">
                  {step.done ? "✓" : index + 1}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <p className="merchant-helper" style={{ marginTop: 4 }}>
                    {step.id === "home"
                      ? "App landing screen with your featured banner and collections."
                      : step.id === "collection"
                        ? "Collection opened from the banner or shop tab."
                        : "Product detail opened from the collection."}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}

function SectionInspector({ section, collections, media = [], onChange, onDelete }) {
  if (section.type === "banner") {
    const collection = collections.find(
      (entry) => entry.handle === section.collectionHandle,
    );
    const fallbackImage =
      collection?.image || collection?.products?.[0]?.image || "";
    const activeImage = section.imageUrl || fallbackImage;

    return (
      <div className="studio-fields">
        <div className="studio-field">
          <span>Banner image</span>
          <small>Pick from Shopify Files, collections, or product media.</small>
          <div className="studio-banner-preview">
            {activeImage ? (
              <img src={activeImage} alt="" />
            ) : (
              <span>No image selected</span>
            )}
          </div>
          <BannerMediaPicker
            media={media}
            selectedUrl={section.imageUrl || ""}
            onSelect={(imageUrl) => onChange({ ...section, imageUrl })}
          />
          {section.imageUrl ? (
            <button
              className="studio-danger"
              type="button"
              onClick={() => onChange({ ...section, imageUrl: "" })}
            >
              Use collection image instead
            </button>
          ) : null}
        </div>

        <label className="studio-field">
          Heading
          <input
            type="text"
            maxLength={60}
            value={section.title}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
          />
          <span className="studio-char">{section.title.length}/60</span>
        </label>
        <label className="studio-field">
          Eyebrow
          <input
            type="text"
            value={section.eyebrow}
            onChange={(event) => onChange({ ...section, eyebrow: event.target.value })}
          />
        </label>
        <label className="studio-field">
          Supporting line
          <input
            type="text"
            value={section.subtitle}
            onChange={(event) => onChange({ ...section, subtitle: event.target.value })}
          />
        </label>
        <label className="studio-field">
          Button label
          <input
            type="text"
            value={section.buttonLabel}
            onChange={(event) =>
              onChange({ ...section, buttonLabel: event.target.value })
            }
          />
        </label>
        <label className="studio-field">
          Tap action
          <select value="collection" disabled>
            <option value="collection">Open a collection</option>
          </select>
          <small>Choose which collection this banner opens.</small>
        </label>
        <CollectionField
          label="Collection"
          value={section.collectionHandle}
          collections={collections}
          onChange={(collectionHandle) => onChange({ ...section, collectionHandle })}
        />
        <button className="studio-danger" type="button" onClick={onDelete}>
          Delete section
        </button>
      </div>
    );
  }

  if (section.type === "categories") {
    return (
      <div className="studio-fields">
        <label className="studio-field">
          Title
          <input
            type="text"
            value={section.title}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
          />
        </label>
        {(section.handles || []).map((handle, index) => (
          <div key={`${section.id}-${index}`} className="studio-fields">
            <CollectionField
              label={`Collection ${index + 1}`}
              value={handle}
              collections={collections}
              onChange={(value) => {
                const handles = section.handles.slice();
                handles[index] = value;
                onChange({ ...section, handles });
              }}
            />
            <button
              className="studio-danger"
              type="button"
              onClick={() =>
                onChange({
                  ...section,
                  handles: section.handles.filter((_, item) => item !== index),
                })
              }
            >
              Remove collection
            </button>
          </div>
        ))}
        <button
          className="studio-btn-ghost"
          type="button"
          disabled={!collections.length}
          onClick={() =>
            onChange({
              ...section,
              handles: [...(section.handles || []), collections[0]?.handle || ""],
            })
          }
        >
          Add collection
        </button>
        <button className="studio-danger" type="button" onClick={onDelete}>
          Delete section
        </button>
      </div>
    );
  }

  return (
    <div className="studio-fields">
      <label className="studio-field">
        Title
        <input
          type="text"
          value={section.title}
          onChange={(event) => onChange({ ...section, title: event.target.value })}
        />
      </label>
      <CollectionField
        label="Collection"
        value={section.type === "collection" ? section.handle : section.collectionHandle}
        collections={collections}
        onChange={(value) =>
          onChange(
            section.type === "collection"
              ? { ...section, handle: value }
              : { ...section, collectionHandle: value },
          )
        }
      />
      <button className="studio-danger" type="button" onClick={onDelete}>
        Delete section
      </button>
    </div>
  );
}

function BannerMediaPicker({ media, selectedUrl, onSelect }) {
  const groups = [
    { id: "files", label: "Shopify Files" },
    { id: "collection", label: "Collections" },
    { id: "product", label: "Products" },
  ];

  if (!media.length) {
    return (
      <p className="merchant-helper">
        No media found yet. Upload images in Shopify Content → Files, or add collection /
        product images.
      </p>
    );
  }

  return (
    <div className="studio-media-picker">
      {groups.map((group) => {
        const items = media.filter((item) => item.source === group.id);
        if (!items.length) return null;
        return (
          <div key={group.id} className="studio-media-group">
            <p className="studio-media-label">{group.label}</p>
            <div className="studio-media-grid">
              {items.slice(0, 12).map((item) => (
                <button
                  key={item.id}
                  className={`studio-media-thumb ${selectedUrl === item.url ? "is-selected" : ""}`}
                  type="button"
                  title={item.label}
                  onClick={() => onSelect(item.url)}
                >
                  <img src={item.url} alt="" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CollectionField({ label, value, collections, onChange }) {
  const known = collections.some((collection) => collection.handle === value);
  const choices =
    known || !value
      ? collections
      : [{ handle: value, title: `${value} (missing)` }, ...collections];
  return (
    <label className="studio-field">
      {label}
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {choices.map((collection) => (
          <option key={collection.handle} value={collection.handle}>
            {collection.title}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatClock(value) {
  try {
    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
