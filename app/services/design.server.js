import { adminGraphql } from "./admin-graphql.server.js";
import { DESIGN_COLORS, DESIGN_FONTS, LAYOUT_DEFAULTS } from "../design/tokens.js";

export { DESIGN_COLORS, DESIGN_FONTS };

const BUTTON_STYLES = ["square", "rounded", "pill"];
const IMAGE_RATIOS = ["1:1", "4:5"];
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function emptyDesign({ shop, shopName, currencyCode }) {
  return stampShop(blankDesign(), { shop, shopName, currencyCode });
}

export function designForEditor(stored, context) {
  const base = emptyDesign(context);
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return base;
  }

  const theme = stored.theme && typeof stored.theme === "object" ? stored.theme : {};
  return {
    ...base,
    tagline: typeof stored.tagline === "string" ? stored.tagline : base.tagline,
    promo: typeof stored.promo === "string" ? stored.promo : "",
    theme: {
      colors: { ...base.theme.colors, ...(theme.colors || {}) },
      typography: {
        ...base.theme.typography,
        ...(theme.typography || {}),
      },
      style: {
        ...base.theme.style,
        ...(theme.style || {}),
        layout: {
          ...LAYOUT_DEFAULTS,
          ...((theme.style && theme.style.layout) || {}),
        },
      },
    },
    home: Array.isArray(stored.home) ? stored.home : [],
  };
}

export function validateDesign(input, { shop, shopName, currencyCode, handles }) {
  try {
    const design = normalizeDesign(input, {
      shop,
      shopName,
      currencyCode,
      handles,
    });
    return { ok: true, design };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function loadDesignCollections(admin) {
  const collections = [];
  let after = null;

  while (collections.length < 100) {
    const data = await adminGraphql(
      admin,
      `#graphql
        query DesignCollections($after: String) {
          collections(first: 50, after: $after) {
            nodes {
              handle
              title
              products(first: 4) {
                nodes {
                  title
                  featuredMedia {
                    preview {
                      image {
                        url
                      }
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }`,
      { after },
    );

    const connection = data.collections;
    for (const node of connection.nodes) {
      collections.push({
        handle: node.handle,
        title: node.title,
        products: node.products.nodes.map((product) => ({
          title: product.title,
          image: product.featuredMedia?.preview?.image?.url || "",
        })),
      });
    }

    if (
      !connection.pageInfo.hasNextPage ||
      !connection.pageInfo.endCursor ||
      connection.pageInfo.endCursor === after
    ) {
      break;
    }
    after = connection.pageInfo.endCursor;
  }

  return collections;
}

function blankDesign() {
  return {
    tagline: "Welcome",
    promo: "",
    theme: {
      colors: {
        primary: "#111111",
        background: "#F7F7F7",
        text: "#111111",
        accent: "#111111",
        surface: "#FFFFFF",
        muted: "#6B7280",
        border: "#E5E7EB",
        sale: "#E11D48",
      },
      typography: {
        headingFont: "Georgia",
        bodyFont: "System",
      },
      style: {
        radius: 0,
        buttonStyle: "square",
        imageRatio: "4:5",
        layout: { ...LAYOUT_DEFAULTS },
      },
    },
    home: [],
  };
}

function normalizeDesign(input, context) {
  const source = record(input, "Design");
  const theme = record(source.theme, "Theme");
  const colors = record(theme.colors, "Colors");
  const typography = record(theme.typography, "Fonts");
  const style = record(theme.style ?? {}, "Style");

  if (!Array.isArray(source.home)) {
    fail("Home must be a list of sections");
  }

  const home = source.home.map((section, index) =>
    normalizeSection(section, index, context.handles),
  );
  const ids = new Set();
  for (const section of home) {
    if (ids.has(section.id)) {
      fail(`Two home sections use the id ${section.id}`);
    }
    ids.add(section.id);
  }

  const normalized = {
    tagline: requiredText(source.tagline, "Tagline"),
    promo: optionalText(source.promo),
    theme: {
      colors: Object.fromEntries(
        DESIGN_COLORS.map((key) => [key, color(colors[key], key)]),
      ),
      typography: {
        headingFont: font(typography.headingFont, "Heading font"),
        bodyFont: font(typography.bodyFont, "Body font"),
      },
      style: {
        radius: radius(style.radius),
        buttonStyle: oneOf(
          style.buttonStyle ?? "square",
          BUTTON_STYLES,
          "Button style",
        ),
        imageRatio: oneOf(
          style.imageRatio ?? "4:5",
          IMAGE_RATIOS,
          "Image ratio",
        ),
        layout: layoutOf(style.layout),
      },
    },
    home,
  };

  return stampShop(normalized, context);
}

function normalizeSection(input, index, handles) {
  const label = `Home section ${index + 1}`;
  const section = record(input, label);
  const type = requiredText(section.type, `${label} type`);
  const id = requiredText(section.id, `${label} id`);

  if (type === "banner") {
    return {
      type,
      id,
      eyebrow: requiredText(section.eyebrow, `${id} eyebrow`),
      title: requiredText(section.title, `${id} title`),
      subtitle: requiredText(section.subtitle, `${id} subtitle`),
      buttonLabel: requiredText(section.buttonLabel, `${id} button label`),
      collectionHandle: collectionHandle(
        section.collectionHandle,
        handles,
        id,
      ),
    };
  }

  if (type === "collection") {
    return {
      type,
      id,
      title: requiredText(section.title, `${id} title`),
      handle: collectionHandle(section.handle, handles, id),
    };
  }

  if (type === "productGrid") {
    return {
      type,
      id,
      title: requiredText(section.title, `${id} title`),
      collectionHandle: collectionHandle(
        section.collectionHandle,
        handles,
        id,
      ),
    };
  }

  if (type === "categories") {
    if (!Array.isArray(section.handles) || section.handles.length === 0) {
      fail(`${id} needs at least one collection`);
    }
    return {
      type,
      id,
      title: requiredText(section.title, `${id} title`),
      handles: section.handles.map((handle) =>
        collectionHandle(handle, handles, id),
      ),
    };
  }

  fail(`${label} has an unknown type: ${type}`);
}

function stampShop(design, { shop, shopName, currencyCode }) {
  const id = String(shop || "").replace(/\.myshopify\.com$/i, "");
  const currency = String(currencyCode || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    fail("Shop currency must be a code like INR");
  }

  return {
    id,
    name: requiredText(shopName, "Shop name"),
    tagline: design.tagline,
    currency,
    promo: design.promo,
    theme: design.theme,
    home: design.home,
  };
}

function collectionHandle(value, handles, label) {
  const handle = requiredText(value, `${label} collection`);
  if (!handles.has(handle)) {
    fail(`${label} uses a collection that is not in this shop: ${handle}`);
  }
  return handle;
}

function font(value, label) {
  return oneOf(requiredText(value, label), DESIGN_FONTS, label);
}

function color(value, label) {
  const text = requiredText(value, label);
  if (!HEX.test(text)) {
    fail(`${label} must look like #112233`);
  }
  return text;
}

function layoutOf(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const layout = {};
  for (const [key, fallback] of Object.entries(LAYOUT_DEFAULTS)) {
    if (source[key] == null || source[key] === "") {
      layout[key] = fallback;
      continue;
    }
    const number = typeof source[key] === "number" ? source[key] : Number(source[key]);
    if (!Number.isFinite(number) || number < 0) {
      fail(`${key} must be a number of 0 or more`);
    }
    layout[key] = number;
  }
  return layout;
}

function radius(value) {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  fail("Radius must be a number of 0 or more");
}

function oneOf(value, allowed, label) {
  if (allowed.includes(value)) return value;
  fail(`${label} must be one of: ${allowed.join(", ")}`);
}

function optionalText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function requiredText(value, label) {
  if (typeof value === "string" && value.trim()) return value.trim();
  fail(`${label} is required`);
}

function record(value, label) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  fail(`${label} must be an object`);
}

function fail(message) {
  throw new Error(message);
}
