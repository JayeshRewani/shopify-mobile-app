import { timingSafeEqual } from "node:crypto";

import { ApiVersion } from "@shopify/shopify-app-react-router/server";

export const STOREFRONT_API_VERSION = ApiVersion.July26;

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShopDomain(value) {
  if (typeof value !== "string") return null;
  const shop = value.trim().toLowerCase();
  return SHOP_DOMAIN.test(shop) ? shop : null;
}

export function readBearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  if (match) return match[1];
  return request.headers.get("x-shopify-storefront-access-token");
}

export function tokensMatch(stored, presented) {
  if (!stored || !presented) return false;

  const left = Buffer.from(stored);
  const right = Buffer.from(presented);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function mobileJson(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function adminOnlySnapshot(config) {
  const definitions = asArray(config.metafieldDefinitions).filter(
    (definition) => !definition.storefrontVisible,
  );
  const metaobjectDefinitions = asArray(config.metaobjectDefinitions).filter(
    (definition) => !definition.storefrontVisible,
  );
  const visibleTypes = new Set(
    asArray(config.metaobjectDefinitions)
      .filter((definition) => definition.storefrontVisible)
      .map((definition) => definition.type),
  );

  return {
    shopDomain: config.shop,
    shopName: config.shopName,
    currencyCode: config.currencyCode,
    syncedAt: config.syncedAt ? config.syncedAt.toISOString() : null,
    truncated: config.truncated ?? {},
    adminOnly: {
      metafieldDefinitions: definitions,
      metafields: asArray(config.adminOnlyMetafields),
      metaobjectDefinitions,
      metaobjects: asArray(config.metaobjects).filter(
        (entry) => !visibleTypes.has(entry.type),
      ),
    },
  };
}
