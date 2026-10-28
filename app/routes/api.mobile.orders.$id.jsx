import { getCustomerOrder } from "../services/orders/handlers";
import {
  readClientIp,
  readMobileSession,
  requireMobileSessionSecret,
  requireStorefrontShop,
  resultToResponse,
} from "../services/orders/http.server";
import { orderStore } from "../services/orders/prisma-store";
import { sharedRateLimit } from "../services/orders/rate-limit";

/** GET /api/mobile/orders/:id?shop= */
export const loader = async ({ request, params }) => {
  const secretError = requireMobileSessionSecret();
  if (secretError) return secretError;

  const auth = await requireStorefrontShop(request);
  if (auth.error) return auth.error;

  const orderId = decodeURIComponent(params.id || "");
  if (!orderId) {
    return resultToResponse({ ok: false, status: 404, error: "not_found" });
  }

  const result = await getCustomerOrder({
    shopDomain: auth.shop,
    orderId,
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
