import { reconcileCheckoutOrder } from "../services/orders/handlers";
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

/** POST /api/mobile/orders/reconcile */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return mobileJson({ error: "method_not_allowed" }, 405);
  }

  const secretError = requireMobileSessionSecret();
  if (secretError) return secretError;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const auth = await requireStorefrontShop(request, body);
  if (auth.error) return auth.error;

  const result = await reconcileCheckoutOrder({
    shopDomain: auth.shop,
    storefrontTokenHeader: auth.storefrontHeader,
    expectedStorefrontToken: auth.config.storefrontAccessToken,
    mobileSessionHeader: readMobileSession(request),
    sessionSecret: process.env.MOBILE_SESSION_SECRET,
    store: orderStore,
    rateLimit: sharedRateLimit,
    clientIp: readClientIp(request),
    checkoutToken: body.checkoutToken || null,
    orderIdHint: body.orderIdHint || null,
    checkoutEmail: body.checkoutEmail || null,
  });

  return resultToResponse(result);
};
