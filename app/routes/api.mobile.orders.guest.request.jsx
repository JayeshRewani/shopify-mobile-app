import { requestGuestOrderAccess } from "../services/orders/handlers";
import {
  findOrderByEmailAndNumber,
} from "../services/orders/admin-lookup.server";
import { sendGuestOrderAccessEmail } from "../services/orders/guest-email.server";
import {
  readClientIp,
  requireStorefrontShop,
  resultToResponse,
} from "../services/orders/http.server";
import { orderStore } from "../services/orders/prisma-store";
import { sharedRateLimit } from "../services/orders/rate-limit";
import { mobileJson } from "../services/mobile-http.server";

/** POST /api/mobile/orders/guest/request */
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

  const email = String(body.email || "");
  const orderNumber = String(body.orderNumber || "");

  const result = await requestGuestOrderAccess({
    shopDomain: auth.shop,
    storefrontTokenHeader: auth.storefrontHeader,
    expectedStorefrontToken: auth.config.storefrontAccessToken,
    store: orderStore,
    rateLimit: sharedRateLimit,
    clientIp: readClientIp(request),
    email,
    orderNumber,
    findOrder: async () => {
      const fromDb = await orderStore.findByEmailAndOrderNumber(
        auth.shop,
        email,
        orderNumber,
      );
      if (fromDb) {
        return {
          shopifyOrderId: fromDb.shopifyOrderId,
          customerEmail: fromDb.customerEmail,
        };
      }
      return findOrderByEmailAndNumber(auth.shop, email, orderNumber);
    },
    onTokenIssued: async ({ rawToken, shopDomain, email: to, orderNumber: number }) => {
      await sendGuestOrderAccessEmail({
        email: to,
        shopDomain,
        orderNumber: number,
        rawToken,
      });
    },
  });

  return resultToResponse(result);
};
