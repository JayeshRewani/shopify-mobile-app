export const DESIGN_FONTS = ["System", "Georgia"];

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

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isHex(value) {
  return HEX.test(value || "");
}

export function safeColor(value, fallback) {
  return isHex(value) ? value : fallback;
}

export function fontFamily(name) {
  return name === "Georgia" ? "Georgia, serif" : "system-ui, sans-serif";
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
    colors: theme.colors || {},
    typography: theme.typography || {},
    style: {
      radius: style.radius ?? 0,
      buttonStyle: style.buttonStyle || "square",
      imageRatio: style.imageRatio || "4:5",
      layout: { ...LAYOUT_DEFAULTS, ...(style.layout || {}) },
    },
    home: design.home || [],
  });
}
