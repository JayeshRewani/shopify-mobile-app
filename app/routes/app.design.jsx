import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { ensureShopCredentials } from "../services/shop-sync.server";
import {
  designForEditor,
  loadDesignCollections,
  validateDesign,
} from "../services/design.server";
import {
  COLOR_LABELS,
  DESIGN_COLORS,
  DESIGN_FONTS,
  LAYOUT_DEFAULTS,
  LAYOUT_LABELS,
  designFingerprint,
  isHex,
  sectionLabel,
} from "../design/tokens";
import { LivePreview } from "../preview/LivePreview";
import "../styles/studio.css";

const BLOCKS = [
  { type: "banner", title: "Banner", hint: "Photo, title, and a button" },
  { type: "categories", title: "Categories", hint: "A row of collection chips" },
  { type: "collection", title: "Collection row", hint: "Products side by side" },
  { type: "productGrid", title: "Product grid", hint: "Two columns of products" },
];

const COLOR_HELP = {
  primary: "Promo bar, banner, filled buttons",
  background: "Page behind the content",
  text: "Titles and body copy",
  accent: "Banner eyebrow and sale badge",
  surface: "Header, cards, and chips",
  muted: "Secondary copy and unselected tabs",
  border: "Hairlines and steppers",
  sale: "Discount price and errors",
};

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const config = await ensureShopCredentials({ admin, shop: session.shop });
  const collections = await loadDesignCollections(admin);
  const context = {
    shop: config.shop,
    shopName: config.shopName,
    currencyCode: config.currencyCode,
  };

  return {
    design: designForEditor(config.draftDesign, context),
    publishedDesign: config.publishedDesign,
    collections,
    shopName: config.shopName,
  };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();
  const config = await ensureShopCredentials({ admin, shop: session.shop });
  const collections = await loadDesignCollections(admin);
  const result = validateDesign(body.design, {
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
  return { ok: true, intent, design: result.design };
};

export default function DesignPage() {
  const loaded = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const [design, setDesign] = useState(loaded.design);
  const [published, setPublished] = useState(loaded.publishedDesign);
  const [pending, setPending] = useState("");
  const [selectedId, setSelectedId] = useState(loaded.design.home[0]?.id || "");
  const [panel, setPanel] = useState("design");
  const saving = fetcher.state !== "idle";
  const error = fetcher.data?.ok === false ? fetcher.data.error : "";
  const live = designFingerprint(design) === designFingerprint(published);
  const selected = design.home.find((section) => section.id === selectedId) || null;

  useEffect(() => {
    if (fetcher.state === "idle") setPending("");
  }, [fetcher.state]);

  useEffect(() => {
    if (!fetcher.data?.ok) return;
    if (fetcher.data.intent === "publish") setPublished(fetcher.data.design);
    shopify.toast.show(
      fetcher.data.intent === "publish" ? "Design published" : "Draft saved",
    );
  }, [fetcher.data, shopify]);

  const save = (intent) => {
    setPending(intent);
    fetcher.submit(
      { intent, design },
      { method: "POST", encType: "application/json" },
    );
  };

  const add = (type) => {
    const handle = loaded.collections[0]?.handle || "";
    const id = `${type}-${crypto.randomUUID().slice(0, 8)}`;
    const section =
      type === "banner"
        ? {
            type,
            id,
            eyebrow: design.name,
            title: "New arrivals",
            subtitle: "Shop this collection.",
            buttonLabel: "Shop now",
            collectionHandle: handle,
          }
        : type === "categories"
          ? { type, id, title: "Shop", handles: handle ? [handle] : [] }
          : type === "collection"
            ? { type, id, title: "Collection", handle }
            : { type, id, title: "Products", collectionHandle: handle };
    setDesign({ ...design, home: [...design.home, section] });
    setSelectedId(id);
    setPanel("design");
  };

  const updateSection = (next) => {
    setDesign({
      ...design,
      home: design.home.map((section) => (section.id === next.id ? next : section)),
    });
  };

  const move = (id, direction) => {
    const index = design.home.findIndex((section) => section.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= design.home.length) return;
    const home = design.home.slice();
    const [section] = home.splice(index, 1);
    home.splice(next, 0, section);
    setDesign({ ...design, home });
  };

  const remove = (id) => {
    const home = design.home.filter((section) => section.id !== id);
    setDesign({ ...design, home });
    if (selectedId === id) setSelectedId(home[0]?.id || "");
  };

  return (
    <div className="studio">
      <header className="studio-top">
        <div className="studio-brand">
          <span className="studio-mark" />
          App studio
        </div>
        <div className="studio-shop">{loaded.shopName}</div>
        <div className="studio-actions">
          <span className={live && published ? "pill live" : "pill"}>
            {live && published ? "Live" : "Draft"}
          </span>
          <button
            className="ghost"
            type="button"
            onClick={() => save("draft")}
            disabled={saving}
          >
            {pending === "draft" ? "Saving" : "Save draft"}
          </button>
          <button
            className="publish"
            type="button"
            onClick={() => save("publish")}
            disabled={saving}
          >
            {pending === "publish" ? "Publishing" : "Publish"}
          </button>
        </div>
      </header>
      <div className="studio-line" />
      {error ? <div className="studio-error">{error}</div> : null}
      <div className="studio-body">
        <aside className="library">
          <p className="panel-label">Design blocks</p>
          {loaded.collections.length === 0 ? (
            <p className="empty-note">
              Add a collection in Shopify before building the home screen.
            </p>
          ) : null}
          <div className="block-list">
            {BLOCKS.map((block) => (
              <div className="block" key={block.type}>
                <BlockSwatch type={block.type} />
                <div>
                  <strong>{block.title}</strong>
                  <span>{block.hint}</span>
                </div>
                <button
                  className="block-add"
                  type="button"
                  aria-label={`Add ${block.title}`}
                  disabled={loaded.collections.length === 0}
                  onClick={() => add(block.type)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
          <p className="panel-label">This screen</p>
          {design.home.length === 0 ? (
            <p className="empty-note">The home screen has no sections yet.</p>
          ) : (
            <div className="screen-list">
              {design.home.map((section, index) => (
                <div className="screen-row-wrap" key={section.id}>
                  <button
                    className={section.id === selectedId ? "screen-row selected" : "screen-row"}
                    type="button"
                    onClick={() => {
                      setSelectedId(section.id);
                      setPanel("design");
                    }}
                  >
                    <span className="index">{index + 1}</span>
                    <strong>{sectionLabel(section.type)}</strong>
                  </button>
                  <div className="row-actions">
                    <button className="icon-button" type="button" onClick={() => move(section.id, -1)} disabled={index === 0}>
                      ↑
                    </button>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => move(section.id, 1)}
                      disabled={index === design.home.length - 1}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
        <main className="canvas">
          <LivePreview design={design} collections={loaded.collections} />
        </main>
        <aside className="inspector">
          <div className="tabs">
            <button
              className={panel === "design" ? "active" : ""}
              type="button"
              onClick={() => setPanel("design")}
            >
              Design
            </button>
            <button
              className={panel === "settings" ? "active" : ""}
              type="button"
              onClick={() => setPanel("settings")}
            >
              Settings
            </button>
          </div>
          {panel === "settings" ? (
            <SettingsFields design={design} onChange={setDesign} />
          ) : selected ? (
            <SectionFields
              section={selected}
              collections={loaded.collections}
              onChange={updateSection}
              onDelete={() => remove(selected.id)}
            />
          ) : (
            <p className="empty-note">
              Add a block, then select it on the phone to edit the copy and collection.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function BlockSwatch({ type }) {
  if (type === "banner") {
    return (
      <div className="swatch banner">
        <i />
      </div>
    );
  }
  if (type === "categories") {
    return (
      <div className="swatch chips">
        <i />
        <i />
        <i />
      </div>
    );
  }
  if (type === "collection") {
    return (
      <div className="swatch row">
        <i />
        <i />
        <i />
      </div>
    );
  }
  return (
    <div className="swatch grid">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}

function SettingsFields({ design, onChange }) {
  const style = design.theme.style;
  const setStyle = (patch) =>
    onChange({
      ...design,
      theme: { ...design.theme, style: { ...style, ...patch } },
    });
  const setLayout = (key, raw) => {
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) return;
    setStyle({ layout: { ...style.layout, [key]: number } });
  };

  return (
    <div className="fields">
      <label>
        Tagline
        <input
          value={design.tagline}
          onChange={(event) => onChange({ ...design, tagline: event.target.value })}
        />
      </label>
      <label>
        Promo
        <input
          value={design.promo || ""}
          placeholder="Leave blank to hide the bar"
          onChange={(event) => onChange({ ...design, promo: event.target.value })}
        />
      </label>
      <div className="color-grid">
        {DESIGN_COLORS.map((key) => (
          <ColorField
            key={key}
            name={key}
            value={design.theme.colors[key]}
            onChange={(value) =>
              onChange({
                ...design,
                theme: {
                  ...design.theme,
                  colors: { ...design.theme.colors, [key]: value },
                },
              })
            }
          />
        ))}
      </div>
      <label>
        Heading font
        <FontSelect
          value={design.theme.typography.headingFont}
          onChange={(headingFont) =>
            onChange({
              ...design,
              theme: {
                ...design.theme,
                typography: { ...design.theme.typography, headingFont },
              },
            })
          }
        />
      </label>
      <label>
        Body font
        <FontSelect
          value={design.theme.typography.bodyFont}
          onChange={(bodyFont) =>
            onChange({
              ...design,
              theme: {
                ...design.theme,
                typography: { ...design.theme.typography, bodyFont },
              },
            })
          }
        />
      </label>
      <div>
        <span className="hint">Button shape</span>
        <div className="choice-row">
          {["square", "rounded", "pill"].map((value) => (
            <button
              key={value}
              className={style.buttonStyle === value ? "active" : ""}
              type="button"
              onClick={() => setStyle({ buttonStyle: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="hint">Photo frame</span>
        <div className="choice-row">
          {["1:1", "4:5"].map((value) => (
            <button
              key={value}
              className={style.imageRatio === value ? "active" : ""}
              type="button"
              onClick={() => setStyle({ imageRatio: value })}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <label>
        Button corner
        <input
          type="number"
          min="0"
          value={style.radius}
          onChange={(event) => {
            const number = Number(event.target.value);
            if (!Number.isFinite(number) || number < 0) return;
            setStyle({ radius: number });
          }}
        />
      </label>
      {Object.keys(LAYOUT_DEFAULTS).map((key) => (
        <label key={key}>
          {LAYOUT_LABELS[key]}
          <input
            type="number"
            min="0"
            value={style.layout?.[key] ?? LAYOUT_DEFAULTS[key]}
            onChange={(event) => setLayout(key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

function ColorField({ name, value, onChange }) {
  const current = isHex(value) ? value : "#111111";
  return (
    <label className="color-row">
      <input
        type="color"
        value={current}
        aria-label={COLOR_LABELS[name]}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
      <span className="color-copy">
        {COLOR_LABELS[name]}
        <small>{COLOR_HELP[name]}</small>
      </span>
    </label>
  );
}

function FontSelect({ value, onChange }) {
  return (
    <select value={DESIGN_FONTS.includes(value) ? value : "System"} onChange={(event) => onChange(event.target.value)}>
      {DESIGN_FONTS.map((font) => (
        <option key={font} value={font}>
          {font}
        </option>
      ))}
    </select>
  );
}

function SectionFields({ section, collections, onChange, onDelete }) {
  return (
    <div className="fields">
      <strong>{sectionLabel(section.type)}</strong>
      {section.type === "banner" ? (
        <>
          <TextField label="Eyebrow" value={section.eyebrow} onChange={(eyebrow) => onChange({ ...section, eyebrow })} />
          <TextField label="Title" value={section.title} onChange={(title) => onChange({ ...section, title })} />
          <TextField label="Subtitle" value={section.subtitle} onChange={(subtitle) => onChange({ ...section, subtitle })} />
          <TextField label="Button" value={section.buttonLabel} onChange={(buttonLabel) => onChange({ ...section, buttonLabel })} />
          <CollectionField
            label="Collection"
            value={section.collectionHandle}
            collections={collections}
            onChange={(collectionHandle) => onChange({ ...section, collectionHandle })}
          />
        </>
      ) : null}
      {section.type === "categories" ? (
        <>
          <TextField label="Title" value={section.title} onChange={(title) => onChange({ ...section, title })} />
          {(section.handles || []).map((handle, index) => (
            <div key={`${section.id}-${index}`}>
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
                className="inline-remove"
                type="button"
                onClick={() =>
                  onChange({
                    ...section,
                    handles: section.handles.filter((_, item) => item !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            className="ghost"
            type="button"
            style={{ color: "#111", background: "#f4f5f7" }}
            disabled={collections.length === 0}
            onClick={() =>
              onChange({
                ...section,
                handles: [...(section.handles || []), collections[0]?.handle || ""],
              })
            }
          >
            Add collection
          </button>
        </>
      ) : null}
      {section.type === "collection" || section.type === "productGrid" ? (
        <>
          <TextField label="Title" value={section.title} onChange={(title) => onChange({ ...section, title })} />
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
        </>
      ) : null}
      <button className="inline-remove" type="button" onClick={onDelete}>
        Delete section
      </button>
    </div>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label>
      {label}
      <input value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function CollectionField({ label, value, collections, onChange }) {
  const known = collections.some((collection) => collection.handle === value);
  const choices =
    known || !value
      ? collections
      : [{ handle: value, title: `${value} (missing)` }, ...collections];
  return (
    <label>
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

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

