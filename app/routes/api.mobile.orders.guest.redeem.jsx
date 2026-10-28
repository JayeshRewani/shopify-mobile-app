import { redeemGuestOrderToken } from "../services/orders/handlers";
import {
  readClientIp,
  requireStorefrontShop,
  resultToResponse,
} from "../services/orders/http.server";
import { orderStore } from "../services/orders/prisma-store";
import { sharedRateLimit } from "../services/orders/rate-limit";
import { mobileJson } from "../services/mobile-http.server";

/** POST /api/mobile/orders/guest/redeem */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return mobileJson({ error: "method_not_allowed" }, 405);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return mobileJson({ error: "invalid_json" }, 400);
  }

  const auth = await requireStorefrontShop(request, body);
  if (auth.error) return auth.error;

  const token = String(body.token || "");
  if (!token) {
    return mobileJson({ error: "not_found" }, 404);
  }

  const result = await redeemGuestOrderToken({
    shopDomain: auth.shop,
    storefrontTokenHeader: auth.storefrontHeader,
    expectedStorefrontToken: auth.config.storefrontAccessToken,
    store: orderStore,
    rateLimit: sharedRateLimit,
    clientIp: readClientIp(request),
    rawToken: token,
  });

  return resultToResponse(result);
};
