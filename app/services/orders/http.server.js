import db from "../../db.server";
import {
  mobileJson,
  normalizeShopDomain,
  readBearerToken,
  tokensMatch,
} from "../mobile-http.server";

export function readShopDomain(request, body = null) {
  const url = new URL(request.url);
  return normalizeShopDomain(
    request.headers.get("x-shop-domain") ||
      body?.shop ||
      url.searchParams.get("shop"),
  );
}

export function readClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "0.0.0.0";
}

export function readMobileSession(request) {
  return request.headers.get("x-mobile-session");
}

export function readCustomerCookie(request) {
  return request.headers.get("x-customer-cookie");
}

export function mobileSessionSecret() {
  return process.env.MOBILE_SESSION_SECRET || "";
}

export function requireMobileSessionSecret() {
  const secret = mobileSessionSecret();
  if (!secret) {
    return mobileJson(
      { error: "mobile_session_secret_missing" },
      503,
    );
  }
  return null;
}

export async function loadShopConfig(shop) {
  return db.shopConfig.findUnique({ where: { shop } });
}

export async function requireStorefrontShop(request, body = null) {
  const shop = readShopDomain(request, body);
  if (!shop) {
    return {
      error: mobileJson(
        { error: "Pass shop as a *.myshopify.com domain." },
        400,
      ),
    };
  }

  const config = await loadShopConfig(shop);
  if (!config?.storefrontAccessToken) {
    return {
      error: mobileJson(
        { error: "This shop has not finished installing the app." },
        404,
      ),
    };
  }

  const presented = readBearerToken(request);
  if (!tokensMatch(config.storefrontAccessToken, presented)) {
    return {
      error: mobileJson({ error: "invalid_app_token" }, 401),
    };
  }

  return {
    shop,
    config,
    storefrontHeader: presented ? `Bearer ${presented}` : null,
  };
}

export function resultToResponse(result) {
  if (!result.ok) {
    return mobileJson({ error: result.error }, result.status);
  }
  return mobileJson(result.body, result.status);
}
