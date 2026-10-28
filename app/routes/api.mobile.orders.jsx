import { rejectClientOrderCreate, listCustomerOrders } from "../services/orders/handlers";
import {
  readClientIp,
  readMobileSession,
  requireMobileSessionSecret,
  requireStorefrontShop,
  resultToResponse,
} from "../services/orders/http.server";
import { orderStore } from "../services/orders/prisma-store";
import { sharedRateLimit } from "../services/orders/rate-limit";
import { mobileJson } from "../services/mobile-http.server";

/** GET /api/mobile/orders?shop= — signed-in customer order list from webhook cache. */
export const loader = async ({ request }) => {
  const secretError = requireMobileSessionSecret();
  if (secretError) return secretError;

  const auth = await requireStorefrontShop(request);
  if (auth.error) return auth.error;

  const result = await listCustomerOrders({
    shopDomain: auth.shop,
    storefrontTokenHeader: auth.storefrontHeader,
    expectedStorefrontToken: auth.config.storefrontAccessToken,
    mobileSessionHeader: readMobileSession(request),
    sessionSecret: process.env.MOBILE_SESSION_SECRET,
    store: orderStore,
    rateLimit: sharedRateLimit,
    clientIp: readClientIp(request),
  });

  return resultToResponse(result);
};

/**
 * POST /api/mobile/orders — client creates are disabled.
 * Checkout completion must call reconcile; webhooks write the DB.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return mobileJson({ error: "method_not_allowed" }, 405);
  }
  const rejected = rejectClientOrderCreate();
  return mobileJson({ error: rejected.error }, rejected.status);
};
