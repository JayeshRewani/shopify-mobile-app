export const DESIGN_FONTS = ["System", "Georgia", "Playfair", "DM Sans"];

export const DESIGN_FONT_LABELS = {
  System: "System",
  Georgia: "Georgia",
  Playfair: "Playfair Display",
  "DM Sans": "DM Sans",
};

export const DESIGN_COLORS = [
  "primary",
  "background",
  "text",
  "accent",
  "surface",
  "muted",
  "border",
  "sale",
];

export const COLOR_LABELS = {
  primary: "Primary",
  background: "Background",
  text: "Text",
  accent: "Accent",
  surface: "Surface",
  muted: "Muted",
  border: "Border",
  sale: "Sale",
};

export const BRAND_COLOR_KEYS = ["primary", "background", "text"];

export const BRAND_COLOR_LABELS = {
  primary: "Oxblood",
  background: "Ivory",
  text: "Ink",
};

export const LAYOUT_DEFAULTS = {
  pagePadding: 16,
  sectionGap: 22,
  bannerRadius: 18,
  bannerHeight: 176,
  cardRadius: 16,
  cardWidth: 168,
};

export const LAYOUT_LABELS = {
  pagePadding: "Page padding",
  sectionGap: "Space between sections",
  bannerRadius: "Banner corners",
  bannerHeight: "Banner height",
  cardRadius: "Card corners",
  cardWidth: "Row card width",
};

export const PRODUCT_CROPS = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "Square (1:1)" },
  { id: "3:4", label: "Portrait (3:4)" },
  { id: "full", label: "Full (fit)" },
];

export const NAV_ICON_IDS = ["home", "shop", "bag", "account"];

export const DEFAULT_NAVIGATION = {
  tabs: [
    {
      id: "home",
      label: "Home",
      icon: "home",
      visible: true,
      destination: "Store home",
    },
    {
      id: "shop",
      label: "Shop",
      icon: "shop",
      visible: true,
      destination: "Catalog",
    },
    {
      id: "bag",
      label: "Bag",
      icon: "bag",
      visible: true,
      destination: "Shopping bag",
    },
    {
      id: "account",
      label: "Account",
      icon: "account",
      visible: true,
      destination: "Customer account",
    },
  ],
};

export const BUY_BUTTON_STYLES = [
  { id: "square", label: "Square", radius: 4 },
  { id: "rounded", label: "Rounded", radius: 12 },
  { id: "pill", label: "Pill", radius: 999 },
];

export const BUY_BUTTON_SIZES = [
  { id: "compact", label: "Compact", height: 40, fontSize: 11 },
  { id: "comfortable", label: "Comfortable", height: 48, fontSize: 12 },
  { id: "large", label: "Large", height: 56, fontSize: 13 },
];

export const DEFAULT_PRODUCT_PAGE = {
  mediaCrop: "3:4",
  previewProductHandle: "",
  buyButtonStyle: "pill",
  buyButtonSize: "comfortable",
  showWishlist: true,
};

export const STUDIO_SCREENS = [
  {
    id: "home",
    label: "Home screen",
    detail: "Design and arrange what customers see first.",
  },
  {
    id: "product",
    label: "Product page",
    detail: "Customize how product details look in your mobile app.",
  },
  {
    id: "navigation",
    label: "Bottom navigation",
    detail: "Customize the bottom navigation for your mobile app.",
  },
  {
    id: "brand",
    label: "Colors & logo",
    detail: "Set your brand colors, logo, and typography.",
  },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isHex(value) {
  return HEX.test(value || "");
}

export function safeColor(value, fallback) {
  return isHex(value) ? value : fallback;
}

export function fontFamily(name) {
  if (name === "Georgia" || name === "Playfair") {
    return '"Playfair Display", Georgia, "Times New Roman", serif';
  }
  if (name === "DM Sans") {
    return '"DM Sans Variable", "DM Sans", system-ui, sans-serif';
  }
  return '"DM Sans Variable", "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
}

export function inkOn(hex) {
  const value = String(hex || "").replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  if ([red, green, blue].some((channel) => Number.isNaN(channel))) {
    return "#FFFFFF";
  }
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 160
    ? "#1A1A1A"
    : "#FFFFFF";
}

export function sectionLabel(type) {
  if (type === "banner") return "Banner";
  if (type === "categories") return "Categories";
  if (type === "collection") return "Collection row";
  if (type === "productGrid") return "Product grid";
  return "Section";
}

export function designFingerprint(design) {
  if (!design || typeof design !== "object") return "";
  const theme = design.theme || {};
  const style = theme.style || {};
  return JSON.stringify({
    tagline: design.tagline || "",
    promo: design.promo || "",
    logoUrl: design.logoUrl == null ? null : design.logoUrl || "",
    colors: theme.colors || {},
    typography: theme.typography || {},
    style: {
      radius: style.radius ?? 0,
      buttonStyle: style.buttonStyle || "square",
      imageRatio: style.imageRatio || "4:5",
      layout: { ...LAYOUT_DEFAULTS, ...(style.layout || {}) },
    },
    home: design.home || [],
    navigation: design.navigation || DEFAULT_NAVIGATION,
    productPage: design.productPage || DEFAULT_PRODUCT_PAGE,
  });
}
