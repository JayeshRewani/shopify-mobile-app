import db from "../db.server";
import {
  adminOnlySnapshot,
  mobileJson,
  normalizeShopDomain,
  readBearerToken,
  tokensMatch,
} from "../services/mobile-http.server";

// Admin-only metafields and metaobjects, copied on the server.
// The caller must already have the Storefront token from /api/mobile/bootstrap.
export const loader = async ({ request }) => {
  const shop = normalizeShopDomain(new URL(request.url).searchParams.get("shop"));
  if (!shop) {
    return mobileJson(
      { error: "Pass shop as a *.myshopify.com domain." },
      400,
    );
  }

  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config?.storefrontAccessToken) {
    return mobileJson(
      { error: "This shop has not finished installing the app." },
      404,
    );
  }

  if (!tokensMatch(config.storefrontAccessToken, readBearerToken(request))) {
    return mobileJson(
      {
        error:
          "Send the Storefront token in Authorization: Bearer, or in X-Shopify-Storefront-Access-Token.",
      },
      401,
    );
  }

  return mobileJson(adminOnlySnapshot(config));
};
