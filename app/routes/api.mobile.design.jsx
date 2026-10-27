import db from "../db.server";
import {
  mobileJson,
  normalizeShopDomain,
  readBearerToken,
  tokensMatch,
} from "../services/mobile-http.server";

// The phone reads the published design only. Drafts stay in the admin.
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

  if (!config.publishedDesign) {
    return mobileJson(
      { error: "This shop has not published a design yet." },
      404,
    );
  }

  return mobileJson({ publishedDesign: config.publishedDesign });
};
