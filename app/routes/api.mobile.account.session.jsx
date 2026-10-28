import { exchangeClassicCustomerSession } from "../services/orders/handlers";
import { probeClassicAccount } from "../services/orders/admin-lookup.server";
import {
  readClientIp,
  readCustomerCookie,
  requireMobileSessionSecret,
  requireStorefrontShop,
  resultToResponse,
} from "../services/orders/http.server";
import { sharedRateLimit } from "../services/orders/rate-limit";
import { mobileJson } from "../services/mobile-http.server";

/** POST /api/mobile/account/session */
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

  const result = await exchangeClassicCustomerSession({
    shopDomain: auth.shop,
    storefrontTokenHeader: auth.storefrontHeader,
    expectedStorefrontToken: auth.config.storefrontAccessToken,
    customerCookie: readCustomerCookie(request),
    sessionSecret: process.env.MOBILE_SESSION_SECRET,
    rateLimit: sharedRateLimit,
    clientIp: readClientIp(request),
    probeAccountHtml: (cookie) => probeClassicAccount(auth.shop, cookie),
  });

  return resultToResponse(result);
};
