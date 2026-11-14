import { adminGraphql, isAccessDenied } from "./admin-graphql.server.js";
import {
  DEFAULT_NAVIGATION,
  BUY_BUTTON_SIZES,
  BUY_BUTTON_STYLES,
  DEFAULT_PRODUCT_PAGE,
  DESIGN_COLORS,
  DESIGN_FONTS,
  LAYOUT_DEFAULTS,
  NAV_ICON_IDS,
  PRODUCT_CROPS,
} from "../design/tokens.js";

export { DESIGN_COLORS, DESIGN_FONTS };

const BUTTON_STYLES = ["square", "rounded", "pill"];
const IMAGE_RATIOS = ["1:1", "4:5"];
const PRODUCT_CROP_IDS = PRODUCT_CROPS.map((crop) => crop.id);
const BUY_STYLE_IDS = BUY_BUTTON_STYLES.map((style) => style.id);
const BUY_SIZE_IDS = BUY_BUTTON_SIZES.map((size) => size.id);
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function emptyDesign({ shop, shopName, currencyCode }) {
  return stampShop(blankDesign(), { shop, shopName, currencyCode });
}

function normalizeCurrencyCode(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "";
}

export function designForEditor(stored, context) {
  const base = emptyDesign({
    ...context,
    // Editor must not crash when sync has not written currency yet.
    currencyCode: normalizeCurrencyCode(context?.currencyCode) || "USD",
  });
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return base;
  }

  const theme = stored.theme && typeof stored.theme === "object" ? stored.theme : {};
  const hasLogo = Object.prototype.hasOwnProperty.call(stored, "logoUrl");
  const logoUrl = !hasLogo
    ? null
    : typeof stored.logoUrl === "string" && /^https?:\/\//i.test(stored.logoUrl.trim())
      ? stored.logoUrl.trim()
      : "";

  return {
    ...base,
    tagline: typeof stored.tagline === "string" ? stored.tagline : base.tagline,
    promo: typeof stored.promo === "string" ? stored.promo : "",
    logoUrl,
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
    navigation: normalizeNavigation(stored.navigation),
    productPage: normalizeProductPage(stored.productPage, base.productPage),
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
              image {
                url
              }
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
        image: node.image?.url || "",
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

/** Banner / section media from Files + catalog images. */
export async function loadDesignMedia(admin) {
  const media = [];
  const seen = new Set();

  const push = (item) => {
    const url = String(item?.url || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    media.push({
      id: item.id || url,
      url,
      label: item.label || "Image",
      source: item.source || "media",
    });
  };

  try {
    const filesData = await adminGraphql(
      admin,
      `#graphql
        query DesignFiles {
          files(first: 40, queryKey: CREATED_AT, reverse: true) {
            nodes {
              ... on MediaImage {
                id
                alt
                image {
                  url
                }
              }
            }
          }
        }`,
    );
    for (const node of filesData.files?.nodes || []) {
      const url = node.image?.url || node.url || "";
      push({
        id: node.id,
        url,
        label: node.alt || "Shopify file",
        source: "files",
      });
    }
  } catch (error) {
    if (!isAccessDenied(error)) {
      console.error("Design media files query failed", error);
    }
  }

  try {
    const collections = await loadDesignCollections(admin);
    for (const collection of collections) {
      if (collection.image) {
        push({
          id: `collection:${collection.handle}`,
          url: collection.image,
          label: collection.title,
          source: "collection",
        });
      }
      for (const product of collection.products || []) {
        push({
          id: `product:${collection.handle}:${product.title}`,
          url: product.image,
          label: product.title,
          source: "product",
        });
      }
    }
  } catch (error) {
    console.error("Design media catalog query failed", error);
  }

  return media.slice(0, 60);
}

/** Shopify brand wordmark from Storefront API (Settings → Brand). */
export async function loadShopBrandLogo({ shop, storefrontAccessToken }) {
  if (!shop || !storefrontAccessToken) return "";
  const domain = String(shop).includes(".")
    ? String(shop)
    : `${shop}.myshopify.com`;
  try {
    const response = await fetch(
      `https://${domain}/api/2026-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
        },
        body: JSON.stringify({
          query: `#graphql
            query ShopBrandLogo {
              shop {
                brand {
                  logo {
                    image {
                      url
                    }
                  }
                  squareLogo {
                    image {
                      url
                    }
                  }
                }
              }
            }`,
        }),
      },
    );
    if (!response.ok) return "";
    const body = await response.json();
    const brand = body?.data?.shop?.brand;
    return (
      brand?.logo?.image?.url ||
      brand?.squareLogo?.image?.url ||
      ""
    );
  } catch (error) {
    console.error("Shop brand logo query failed", error);
    return "";
  }
}

export async function loadDesignProducts(admin) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query DesignProducts {
        products(first: 12, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            handle
            title
            description
            status
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
      }`,
  );

  return (data.products?.nodes || []).map((product) => ({
    handle: product.handle,
    title: product.title || "Product",
    description: String(product.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120),
    status: product.status || "ACTIVE",
    image: product.featuredMedia?.preview?.image?.url || "",
    price: product.priceRangeV2?.minVariantPrice?.amount || "",
    currencyCode: product.priceRangeV2?.minVariantPrice?.currencyCode || "",
  }));
}

/** Lightweight catalog slice for the Home phone emulator. */
export async function loadHomePreviewCatalog(admin) {
  const data = await adminGraphql(
    admin,
    `#graphql
      query HomePreviewCatalog {
        products(first: 4, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            title
            featuredMedia {
              preview {
                image {
                  url
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
        collections(first: 1, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            title
            image {
              url
            }
          }
        }
      }`,
  );

  const products = (data.products?.nodes || []).map((product) => ({
    title: product.title || "Product",
    image: product.featuredMedia?.preview?.image?.url || "",
    price: product.priceRangeV2?.minVariantPrice?.amount || "",
    currencyCode: product.priceRangeV2?.minVariantPrice?.currencyCode || "",
  }));

  const collection = data.collections?.nodes?.[0] || null;

  return {
    products,
    bannerImage: collection?.image?.url || products[0]?.image || "",
    bannerTitle: collection?.title || "",
  };
}

function blankDesign() {
  return {
    tagline: "Welcome",
    promo: "",
    logoUrl: null,
    theme: {
      colors: {
        primary: "#6B0F2B",
        background: "#F8F4E8",
        text: "#0F0F10",
        accent: "#C4A4AD",
        surface: "#FFFFFF",
        muted: "#6B6560",
        border: "#E6DFD2",
        sale: "#6B0F2B",
      },
      typography: {
        headingFont: "Playfair",
        bodyFont: "DM Sans",
      },
      style: {
        radius: 12,
        buttonStyle: "pill",
        imageRatio: "4:5",
        layout: { ...LAYOUT_DEFAULTS },
      },
    },
    home: [],
    navigation: structuredClone(DEFAULT_NAVIGATION),
    productPage: { ...DEFAULT_PRODUCT_PAGE },
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
    logoUrl:
      !Object.prototype.hasOwnProperty.call(source, "logoUrl") ||
      source.logoUrl == null
        ? null
        : optionalImageUrl(source.logoUrl),
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
    navigation: normalizeNavigation(source.navigation),
    productPage: normalizeProductPage(source.productPage, DEFAULT_PRODUCT_PAGE),
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
      imageUrl: optionalImageUrl(section.imageUrl),
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
    logoUrl: design.logoUrl == null ? null : design.logoUrl || "",
    theme: design.theme,
    home: design.home,
    navigation: design.navigation || structuredClone(DEFAULT_NAVIGATION),
    productPage: design.productPage || { ...DEFAULT_PRODUCT_PAGE },
  };
}

function normalizeNavigation(value) {
  const base = structuredClone(DEFAULT_NAVIGATION);
  if (!value || typeof value !== "object" || Array.isArray(value)) return base;
  const incoming = Array.isArray(value.tabs) ? value.tabs : [];
  const defaults = new Map(base.tabs.map((tab) => [tab.id, tab]));
  const used = new Set();
  const tabs = [];

  for (const entry of incoming) {
    if (!entry || typeof entry !== "object" || !defaults.has(entry.id) || used.has(entry.id)) {
      continue;
    }
    const tab = defaults.get(entry.id);
    used.add(entry.id);
    const label =
      typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim().slice(0, 12)
        : tab.label;
    const icon =
      typeof entry.icon === "string" && NAV_ICON_IDS.includes(entry.icon)
        ? entry.icon
        : tab.icon;
    tabs.push({
      ...tab,
      label,
      icon,
      visible: entry.visible === false ? false : true,
      destination:
        typeof entry.destination === "string" && entry.destination.trim()
          ? entry.destination.trim()
          : tab.destination,
    });
  }

  for (const tab of base.tabs) {
    if (!used.has(tab.id)) tabs.push({ ...tab });
  }

  return { tabs };
}

function normalizeProductPage(value, fallback = DEFAULT_PRODUCT_PAGE) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const crop = PRODUCT_CROP_IDS.includes(source.mediaCrop)
    ? source.mediaCrop
    : fallback.mediaCrop;
  const buyButtonStyle = BUY_STYLE_IDS.includes(source.buyButtonStyle)
    ? source.buyButtonStyle
    : fallback.buyButtonStyle || "pill";
  const buyButtonSize = BUY_SIZE_IDS.includes(source.buyButtonSize)
    ? source.buyButtonSize
    : fallback.buyButtonSize || "comfortable";
  return {
    mediaCrop: crop,
    previewProductHandle:
      typeof source.previewProductHandle === "string"
        ? source.previewProductHandle
        : fallback.previewProductHandle || "",
    buyButtonStyle,
    buyButtonSize,
    showWishlist: source.showWishlist === false ? false : true,
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

function optionalImageUrl(value) {
  const text = optionalText(value);
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) {
    fail("Image must be a full https URL");
  }
  return text;
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
