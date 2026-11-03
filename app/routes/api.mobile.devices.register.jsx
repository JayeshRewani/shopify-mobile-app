import db from "../db.server";
import { mobileJson, normalizeShopDomain } from "../services/mobile-http.server";
import { registerDeviceToken } from "../services/notifications/device-tokens.server";
import { readClientIp, readMobileSession } from "../services/orders/http.server";
import { sharedRateLimit } from "../services/orders/rate-limit";

/** POST /api/mobile/devices/register */
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

  const shopDomain = normalizeShopDomain(
    request.headers.get("x-shop-domain") || body.shop || body.shopDomain,
  );
  if (!shopDomain) {
    return mobileJson({ error: "Pass shop as a *.myshopify.com domain." }, 400);
  }

  const ip = readClientIp(request);
  if (!sharedRateLimit.hit(`device-register:${shopDomain}:${ip}`, 60_000, 30)) {
    return mobileJson({ error: "rate_limited" }, 429);
  }

  try {
    const device = await registerDeviceToken(db, {
      shopDomain,
      registrationKey:
        request.headers.get("x-registration-key") || body.registrationKey,
      token: body.token,
      platform: body.platform,
      mobileSessionToken: readMobileSession(request) || body.mobileSessionToken,
      sessionSecret: process.env.MOBILE_SESSION_SECRET || "",
    });
    return mobileJson({ ok: true, device }, 201);
  } catch (error) {
    return mobileJson(
      { error: error?.code || error?.message || "register_failed" },
      error?.status || 400,
    );
  }
};
