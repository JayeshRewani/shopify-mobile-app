import db from "../db.server";
import {
  STOREFRONT_API_VERSION,
  mobileJson,
  normalizeShopDomain,
} from "../services/mobile-http.server";

// Returns the only credentials the mobile app is allowed to hold.
export const loader = async ({ request }) => {
  const shop = normalizeShopDomain(new URL(request.url).searchParams.get("shop"));
  if (!shop) {
    return mobileJson(
      { error: "Pass shop as a *.myshopify.com domain." },
      400,
    );
  }

  const config = await db.shopConfig.findUnique({
    where: { shop },
    select: {
      shop: true,
      storefrontAccessToken: true,
    },
  });

  if (!config?.storefrontAccessToken) {
    return mobileJson(
      { error: "This shop has not finished installing the app." },
      404,
    );
  }

  return mobileJson({
    shopDomain: config.shop,
    storefrontAccessToken: config.storefrontAccessToken,
    storefrontApiVersion: STOREFRONT_API_VERSION,
  });
};
