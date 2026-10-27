import { useState } from "react";
import { fontFamily, inkOn, safeColor } from "../design/tokens";
import "./live-preview.css";

const SCREENS = [
  ["home", "Home"],
  ["product", "Product"],
  ["catalog", "Catalog"],
  ["tracking", "Track"],
  ["wishlist", "Saved"],
  ["account", "Account"],
];

const TABS = [
  ["home", "Home", "home"],
  ["catalog", "Catalog", "grid"],
  ["tracking", "Track", "truck"],
  ["wishlist", "Saved", "heart"],
  ["account", "Account", "user"],
];

const SAMPLE = [
  {
    id: 1,
    title: "AeroPulse Wireless Headphones",
    price: 189,
    was: 249,
    rating: 4.8,
    reviews: 124,
    category: "Electronics",
    badge: "Best Seller",
    image: "/preview/headphones.jpg",
    description: "Spatial sound, noise cancellation, and 40 hours of battery.",
    colors: ["Midnight Black", "Silver Frost"],
  },
  {
    id: 2,
    title: "Minimalist Studio Desk Lamp",
    price: 84,
    was: 110,
    rating: 4.6,
    reviews: 89,
    category: "Home",
    badge: "Sale",
    image: "/preview/lamp.jpg",
    description: "Warm touch dimming and a USB-C hub in brushed aluminum.",
    colors: ["Matte Black", "Sand Beige"],
  },
  {
    id: 3,
    title: "Urban Explorer Waterproof Pack",
    price: 135,
    was: 160,
    rating: 4.9,
    reviews: 210,
    category: "Travel",
    badge: "Trending",
    image: "/preview/pack.jpg",
    description: "Weatherproof rolltop with a padded laptop sleeve.",
    colors: ["Obsidian", "Olive"],
  },
  {
    id: 4,
    title: "Precision Mechanical Smartwatch",
    price: 299,
    was: 349,
    rating: 4.7,
    reviews: 76,
    category: "Electronics",
    badge: "New",
    image: "/preview/watch.jpg",
    description: "Mechanical hands with a hidden screen for health tracking.",
    colors: ["Titanium", "Stealth"],
  },
];

export function LivePreview({ design, collections }) {
  const colors = design.theme.colors;
  const primary = safeColor(colors.primary, "#6366F1");
  const accent = safeColor(colors.accent, "#F43F5E");
  const radius = Number(design.theme.style.layout?.cardRadius ?? design.theme.style.radius) || 16;
  const [screen, setScreen] = useState("home");
  const [dark, setDark] = useState(false);
  const [current, setCurrent] = useState(SAMPLE[0]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([{ ...SAMPLE[0], qty: 1 }]);
  const [saved, setSaved] = useState([1, 3]);
  const banner = design.home.find((section) => section.type === "banner");
  const categorySection = design.home.find((section) => section.type === "categories");
  const chips = categoryNames(categorySection, collections);
  const paper = dark ? "#0f172a" : safeColor(colors.background, "#f8fafc");
  const ink = dark ? "#f8fafc" : safeColor(colors.text, "#0f172a");
  const card = dark ? "#111827" : safeColor(colors.surface, "#ffffff");
  const line = dark ? "#1f2937" : safeColor(colors.border, "#e5e7eb");
  const muted = safeColor(colors.muted, "#6b7280");
  const onPrimary = inkOn(primary);
  const font = fontFamily(design.theme.typography.bodyFont);
  const heading = fontFamily(design.theme.typography.headingFont);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

  const openProduct = (product) => {
    setCurrent(product);
    setScreen("product");
  };

  const add = (product) => {
    setCart((items) => {
      const found = items.find((item) => item.id === product.id);
      if (found) {
        return items.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [...items, { ...product, qty: 1 }];
    });
    setCartOpen(true);
  };

  const toggleSaved = (id) => {
    setSaved((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  };

  const shell = {
    background: paper,
    color: ink,
    borderRadius: 32,
    fontFamily: font,
  };

  return (
    <div className="live">
      <div className="live-status">
        <span className="live-dot" />
        Live preview
        <button className="live-theme" type="button" onClick={() => setDark((value) => !value)}>
          {dark ? "Light" : "Dark"}
        </button>
      </div>
      <div className="live-screens">
        {SCREENS.map(([id, label]) => (
          <button
            key={id}
            className={screen === id ? "active" : ""}
            type="button"
            onClick={() => setScreen(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="live-device">
        <div className="live-screen" style={shell}>
          <div className="live-notch" />
          <header className="live-header" style={{ background: card, borderColor: line }}>
            {screen === "home" ? (
              <span className="live-logo" style={{ background: primary }}>
                {(design.name || "S").slice(0, 1)}
              </span>
            ) : (
              <button className="live-icon" type="button" aria-label="Back" onClick={() => setScreen("home")}>
                <Icon name="back" />
              </button>
            )}
            <div className="live-title" style={{ fontFamily: heading }}>
              {screen === "home" ? design.name : screen === "product" ? current.title : titleFor(screen)}
            </div>
            <div className="live-header-actions">
              <button className="live-icon" type="button" aria-label="Saved" onClick={() => setScreen("wishlist")}>
                <Icon name={saved.length ? "heart-fill" : "heart"} />
              </button>
              <button className="live-icon" type="button" aria-label="Bag" onClick={() => setCartOpen(true)}>
                <Icon name="bag" />
                {cart.length ? (
                  <span className="live-badge" style={{ background: accent }}>
                    {cart.reduce((sum, item) => sum + item.qty, 0)}
                  </span>
                ) : null}
              </button>
            </div>
          </header>

          <div className="live-body">
            {screen === "home" ? (
              <HomeScreen
                design={design}
                banner={banner}
                chips={chips}
                primary={primary}
                accent={accent}
                radius={radius}
                card={card}
                line={line}
                muted={muted}
                onPrimary={onPrimary}
                saved={saved}
                onOpen={openProduct}
                onAdd={add}
                onSave={toggleSaved}
                onCatalog={() => setScreen("catalog")}
              />
            ) : null}
            {screen === "product" ? (
              <ProductScreen
                product={current}
                primary={primary}
                accent={accent}
                radius={radius}
                card={card}
                line={line}
                muted={muted}
                currency={design.currency}
                saved={saved.includes(current.id)}
                onSave={() => toggleSaved(current.id)}
                onAdd={() => add(current)}
                onPrimary={onPrimary}
              />
            ) : null}
            {screen === "catalog" ? (
              <CatalogScreen
                primary={primary}
                radius={radius}
                card={card}
                line={line}
                muted={muted}
                currency={design.currency}
                onOpen={openProduct}
                onAdd={add}
              />
            ) : null}
            {screen === "tracking" ? (
              <TrackingScreen primary={primary} accent={accent} radius={radius} card={card} line={line} muted={muted} />
            ) : null}
            {screen === "wishlist" ? (
              <WishlistScreen
                saved={saved}
                primary={primary}
                radius={radius}
                card={card}
                line={line}
                muted={muted}
                currency={design.currency}
                onAdd={add}
                onSave={toggleSaved}
                onHome={() => setScreen("home")}
              />
            ) : null}
            {screen === "account" ? (
              <AccountScreen
                name={design.name}
                tagline={design.tagline}
                primary={primary}
                radius={radius}
                card={card}
                line={line}
                muted={muted}
                dark={dark}
                onDark={() => setDark((value) => !value)}
                onTracking={() => setScreen("tracking")}
              />
            ) : null}
          </div>

          {cartOpen ? (
            <div className="live-sheet-back">
              <div className="live-sheet" style={{ background: card, color: ink }}>
                <div className="live-between">
                  <strong>Bag ({cart.length})</strong>
                  <button className="live-icon" type="button" aria-label="Close bag" onClick={() => setCartOpen(false)}>
                    <Icon name="close" />
                  </button>
                </div>
                {cart.map((item) => (
                  <div className="live-cart-row" key={item.id} style={{ background: paper, borderRadius: Math.min(radius, 16) }}>
                    <img src={item.image} alt="" />
                    <div>
                      <h3>{item.title}</h3>
                      <div className="live-price" style={{ color: primary }}>{money(item.price, design.currency)}</div>
                    </div>
                    <div className="live-stepper">
                      <button type="button" onClick={() => changeQty(setCart, item.id, -1)}>-</button>
                      <span>{item.qty}</span>
                      <button type="button" onClick={() => changeQty(setCart, item.id, 1)}>+</button>
                    </div>
                  </div>
                ))}
                <div className="live-between">
                  <span>Total</span>
                  <strong style={{ color: primary }}>{money(total, design.currency)}</strong>
                </div>
                <button className="live-buy" style={{ width: "100%", background: primary, color: onPrimary, borderRadius: radius }} type="button" onClick={() => setCartOpen(false)}>
                  Checkout
                </button>
              </div>
            </div>
          ) : null}

          <nav className="live-tabs" style={{ background: card, borderColor: line, color: muted }}>
            {TABS.map(([id, label, icon]) => (
              <button
                key={id}
                className={screen === id ? "active" : ""}
                style={{ color: screen === id ? primary : muted }}
                type="button"
                onClick={() => setScreen(id)}
              >
                <Icon name={icon === "heart" && saved.length ? "heart-fill" : icon} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

function HomeScreen({
  design, banner, chips, primary, accent, radius, card, line, muted, onPrimary,
  saved, onOpen, onAdd, onSave, onCatalog,
}) {
  return (
    <div className="live-pad">
      <div className="live-search" style={{ background: card, borderColor: line, borderRadius: radius, color: muted }}>
        Search {design.name}
      </div>
      {design.promo ? (
        <div style={{ padding: "8px 10px", borderRadius: radius, background: primary, color: onPrimary, fontSize: 12, textAlign: "center" }}>
          {design.promo}
        </div>
      ) : null}
      <div className="live-banner" style={{ background: primary, color: onPrimary, borderRadius: radius }}>
        <span style={{ background: accent }}>{banner?.eyebrow || "New"}</span>
        <h2>{banner?.title || design.tagline}</h2>
        <p>{banner?.subtitle || "Shop the latest from this store."}</p>
        <button style={{ borderRadius: radius }} type="button" onClick={onCatalog}>
          {banner?.buttonLabel || "Shop now"}
        </button>
      </div>
      <div>
        <div className="live-label-row">
          <span>Categories</span>
          <button className="live-link" style={{ color: primary }} type="button" onClick={onCatalog}>See all</button>
        </div>
        <div className="live-chips">
          {chips.map((chip, index) => (
            <button
              key={chip}
              className="live-chip"
              style={{
                borderRadius: radius,
                background: index === 0 ? primary : card,
                color: index === 0 ? onPrimary : muted,
                borderColor: line,
              }}
              type="button"
              onClick={onCatalog}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="live-label-row">
          <span>Flash deals <span className="live-sale" style={{ background: accent }}>Live</span></span>
        </div>
        <div className="live-row-scroll">
          {SAMPLE.map((product) => (
            <button key={product.id} className="live-deal" style={{ background: card, borderColor: line, borderRadius: radius }} type="button" onClick={() => onOpen(product)}>
              <div className="live-photo square" style={{ borderRadius: Math.max(radius - 6, 8) }}>
                <img src={product.image} alt="" />
                <span className="live-off" style={{ background: accent, position: "absolute", top: 6, left: 6 }}>
                  −{Math.round((1 - product.price / product.was) * 100)}%
                </span>
              </div>
              <h3>{product.title}</h3>
              <div className="live-price" style={{ color: primary }}>{money(product.price, design.currency)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="live-grid">
        {SAMPLE.map((product) => (
          <article key={product.id} className="live-card" style={{ background: card, borderColor: line, borderRadius: radius }} onClick={() => onOpen(product)}>
            <button
              className="live-heart"
              type="button"
              aria-label="Save"
              style={{ color: saved.includes(product.id) ? accent : "#111827" }}
              onClick={(event) => { event.stopPropagation(); onSave(product.id); }}
            >
              <Icon name={saved.includes(product.id) ? "heart-fill" : "heart"} />
            </button>
            <div className="live-photo square" style={{ borderRadius: Math.max(radius - 6, 8) }}>
              <img src={product.image} alt="" />
            </div>
            <h3>{product.title}</h3>
            <div className="live-between">
              <span className="live-price" style={{ color: primary }}>{money(product.price, design.currency)}</span>
              <button className="live-plus" style={{ background: primary, borderRadius: 8 }} type="button" onClick={(event) => { event.stopPropagation(); onAdd(product); }}>+</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ProductScreen({ product, primary, accent, radius, card, line, muted, currency, saved, onSave, onAdd, onPrimary }) {
  return (
    <div className="live-product">
      <div className="live-hero">
        <img src={product.image} alt="" />
      </div>
      <div className="live-pad">
        <div className="live-between">
          <h2 className="live-name" style={{ margin: 0, fontSize: 16 }}>{product.title}</h2>
          <button className="live-icon" type="button" aria-label="Save" style={{ color: saved ? accent : "inherit" }} onClick={onSave}>
            <Icon name={saved ? "heart-fill" : "heart"} />
          </button>
        </div>
        <div className="live-price-row" style={{ gap: 8 }}>
          <strong style={{ color: primary, fontSize: 18 }}>{money(product.price, currency)}</strong>
          <span className="live-was">{money(product.was, currency)}</span>
          <span className="live-sale" style={{ background: accent }}>Save {money(product.was - product.price, currency)}</span>
        </div>
        <div style={{ color: muted, fontSize: 12 }}>★ {product.rating} ({product.reviews} reviews)</div>
        <div className="live-chips">
          {product.colors.map((color, index) => (
            <span key={color} className="live-chip" style={{ borderRadius: radius, borderColor: index === 0 ? primary : line, color: index === 0 ? primary : muted }}>
              {color}
            </span>
          ))}
        </div>
        <p className="live-muted" style={{ color: muted }}>{product.description}</p>
        <div className="live-actions">
          <button className="live-buy" style={{ background: card, color: primary, borderRadius: 12, border: `1px solid ${line}` }} type="button" onClick={onAdd}>
            Add to bag
          </button>
          <button className="live-buy" style={{ background: primary, color: onPrimary, borderRadius: 12 }} type="button" onClick={onAdd}>
            Buy now
          </button>
        </div>
        <div className="live-feedback" style={{ background: card, borderColor: line, borderRadius: Math.min(radius, 16) }}>
          <strong>Customer feedback</strong>
          <p className="live-muted" style={{ color: muted }}>Exceeded expectations. The build quality is excellent.</p>
        </div>
      </div>
    </div>
  );
}

function CatalogScreen({ primary, radius, card, line, muted, currency, onOpen, onAdd }) {
  return (
    <div className="live-pad">
      <div className="live-between">
        <span>Filter</span>
        <span style={{ color: muted }}>{SAMPLE.length} items</span>
      </div>
      <div className="live-banner" style={{ background: "#111827", borderRadius: radius }}>
        <h2 style={{ fontSize: 16 }}>All hardware and gear</h2>
        <p>The catalog the phone loads from this shop.</p>
      </div>
      <div className="live-grid">
        {SAMPLE.map((product) => (
          <article key={product.id} className="live-card" style={{ background: card, borderColor: line, borderRadius: radius }} onClick={() => onOpen(product)}>
            <div className="live-photo square" style={{ borderRadius: Math.max(radius - 6, 8) }}>
              <img src={product.image} alt="" />
            </div>
            <h3>{product.title}</h3>
            <div style={{ color: muted, fontSize: 11 }}>{product.category}</div>
            <div className="live-between">
              <span className="live-price" style={{ color: primary }}>{money(product.price, currency)}</span>
              <button className="live-plus" style={{ background: line, color: "inherit", borderRadius: 8 }} type="button" onClick={(event) => { event.stopPropagation(); onAdd(product); }}>+</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TrackingScreen({ primary, accent, radius, card, line, muted }) {
  const steps = [
    ["Out for delivery", "Local courier · 08:30"],
    ["Arrived at the hub", "Yesterday · 23:45"],
    ["Package dispatched", "Warehouse"],
    ["Order placed", "Payment verified"],
  ];
  return (
    <div className="live-pad">
      <div className="live-card" style={{ background: card, borderColor: line, borderRadius: radius }}>
        <div className="live-between">
          <div>
            <div style={{ color: muted, fontSize: 10 }}>Order</div>
            <strong>#ORD-94820</strong>
          </div>
          <span className="live-sale" style={{ background: "#10b981" }}>In transit</span>
        </div>
        <p className="live-muted" style={{ color: muted }}>Tomorrow by 4:00 PM</p>
      </div>
      <div className="live-timeline" style={{ borderColor: primary }}>
        {steps.map(([title, when], index) => (
          <div key={title}>
            <strong style={{ color: index === 0 ? primary : "inherit", fontSize: 13 }}>{title}</strong>
            <div style={{ color: muted, fontSize: 11 }}>{when}</div>
          </div>
        ))}
      </div>
      <div className="live-map">Courier nearby</div>
      <span className="live-sale" style={{ background: accent, justifySelf: "start" }}>Preview only</span>
    </div>
  );
}

function WishlistScreen({ saved, primary, radius, card, line, muted, currency, onAdd, onSave, onHome }) {
  const items = SAMPLE.filter((product) => saved.includes(product.id));
  if (!items.length) {
    return (
      <div className="live-pad" style={{ textAlign: "center", paddingTop: 48 }}>
        <span className="live-empty-icon" style={{ color: primary }}><Icon name="heart" /></span>
        <strong>Your wishlist is empty</strong>
        <button className="live-buy" style={{ background: primary, color: inkOn(primary), borderRadius: radius, width: "100%" }} type="button" onClick={onHome}>
          Explore products
        </button>
      </div>
    );
  }
  return (
    <div className="live-pad">
      {items.map((product) => (
        <div className="live-wish" key={product.id} style={{ background: card, borderColor: line, borderRadius: radius }}>
          <img src={product.image} alt="" />
          <div className="live-wish-copy">
            <div className="live-name">{product.title}</div>
            <div className="live-price" style={{ color: primary }}>{money(product.price, currency)}</div>
            <div className="live-wish-actions">
              <button className="live-move" style={{ background: primary, color: inkOn(primary), borderRadius: 999 }} type="button" onClick={() => onAdd(product)}>
                Add
              </button>
              <button className="live-link" style={{ color: muted }} type="button" onClick={() => onSave(product.id)}>Remove</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountScreen({ name, tagline, primary, radius, card, line, muted, dark, onDark, onTracking }) {
  const rows = [
    ["Orders", onTracking],
    ["Addresses", null],
    ["Payments", null],
    ["Notifications", null],
  ];
  return (
    <div className="live-pad">
      <div className="live-account" style={{ background: card, borderColor: line, borderRadius: radius }}>
        <div className="live-avatar" style={{ background: primary }}>{(name || "S").slice(0, 1)}</div>
        <div>
          <strong>{name}</strong>
          <div style={{ color: muted, fontSize: 12 }}>{tagline}</div>
        </div>
      </div>
      {rows.map(([label, action]) => (
        <button key={label} className="live-between live-card" style={{ background: card, borderColor: line, borderRadius: radius, width: "100%" }} type="button" onClick={action || undefined}>
          <span>{label}</span>
          <Icon name="chevron" />
        </button>
      ))}
      <button className="live-between live-card" style={{ background: card, borderColor: line, borderRadius: radius, width: "100%" }} type="button" onClick={onDark}>
        <span>{dark ? "Dark preview" : "Light preview"}</span>
        <Icon name={dark ? "moon" : "sun"} />
      </button>
    </div>
  );
}

function categoryNames(section, collections) {
  if (!section?.handles?.length) return ["All", "Electronics", "Home", "Travel"];
  const titles = section.handles.map((handle) => collections.find((item) => item.handle === handle)?.title || handle);
  return ["All", ...titles];
}

function titleFor(screen) {
  if (screen === "home") return "Discover";
  if (screen === "product") return "Product";
  if (screen === "catalog") return "Catalog";
  if (screen === "tracking") return "Order status";
  if (screen === "wishlist") return "Saved";
  return "Profile";
}

function Icon({ name }) {
  const props = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  if (name === "back") {
    return <svg {...props}><path d="M15 18 9 12l6-6" /></svg>;
  }
  if (name === "heart-fill") {
    return <svg {...props} fill="currentColor" stroke="none"><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" /></svg>;
  }
  if (name === "heart") {
    return <svg {...props}><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 4.6-7 9-7 9z" /></svg>;
  }
  if (name === "bag") {
    return <svg {...props}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V7a3 3 0 0 1 6 0v1" /></svg>;
  }
  if (name === "grid") {
    return <svg {...props}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
  }
  if (name === "truck") {
    return <svg {...props}><path d="M3 7h11v8H3z" /><path d="M14 10h4l3 3v2h-7z" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /></svg>;
  }
  if (name === "user") {
    return <svg {...props}><circle cx="12" cy="8" r="3" /><path d="M5 19a7 7 0 0 1 14 0" /></svg>;
  }
  if (name === "close") {
    return <svg {...props}><path d="M6 6l12 12M18 6 6 18" /></svg>;
  }
  if (name === "chevron") {
    return <svg {...props} width="16" height="16"><path d="m9 6 6 6-6 6" /></svg>;
  }
  if (name === "moon") {
    return <svg {...props}><path d="M20 14.5A7.5 7.5 0 1 1 9.5 4 6 6 0 0 0 20 14.5z" /></svg>;
  }
  if (name === "sun") {
    return <svg {...props}><circle cx="12" cy="12" r="3.5" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></svg>;
  }
  return <svg {...props}><path d="m4 11 8-7 8 7" /><path d="M6 10v9h12v-9" /></svg>;
}

function money(amount, currency) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

function changeQty(setCart, id, delta) {
  setCart((items) =>
    items.map((item) =>
      item.id === id ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
    ),
  );
}
