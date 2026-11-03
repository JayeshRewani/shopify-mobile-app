import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeShopDomain } from "../mobile-http.server.js";
import { verifyMobileSessionToken } from "../orders/customer-session.js";

const PLATFORMS = new Set(["ANDROID", "IOS"]);
const MAX_TOKEN_LENGTH = 4096;

export function hashRegistrationKey(rawKey) {
  return createHash("sha256").update(String(rawKey), "utf8").digest("hex");
}

export function issueRegistrationKey() {
  const key = `reg_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashRegistrationKey(key) };
}

export function registrationKeysMatch(storedHash, presentedKey) {
  if (!storedHash || !presentedKey) return false;
  const left = Buffer.from(storedHash, "utf8");
  const right = Buffer.from(hashRegistrationKey(presentedKey), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function rotateMobileAppRegistrationKey(db, shopDomain) {
  const shop = requireShop(shopDomain);
  const app = await db.mobileApp.findUnique({ where: { shopDomain: shop } });
  if (!app) throw deviceError("mobile_app_not_found", 404);
  const issued = issueRegistrationKey();
  await db.mobileApp.update({
    where: { shopDomain: shop },
    data: { registrationKeyHash: issued.hash },
  });
  return {
    mobileAppId: app.id,
    shopDomain: shop,
    registrationKey: issued.key,
  };
}

/**
 * Register an FCM token. Auth is the installation registration key
 * (not the Storefront token). Optional X-Mobile-Session attaches customerId.
 */
export async function registerDeviceToken(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const token = normalizeToken(input.token);
  const platform = normalizePlatform(input.platform);
  const registrationKey = String(input.registrationKey || "").trim();
  if (!registrationKey) throw deviceError("registration_key_required", 401);

  const mobileApp = await db.mobileApp.findUnique({ where: { shopDomain } });
  if (!mobileApp?.registrationKeyHash) {
    throw deviceError("registration_key_not_configured", 503);
  }
  if (!registrationKeysMatch(mobileApp.registrationKeyHash, registrationKey)) {
    throw deviceError("invalid_registration_key", 401);
  }

  let customerId = null;
  if (input.mobileSessionToken && input.sessionSecret) {
    const session = verifyMobileSessionToken(
      input.sessionSecret,
      input.mobileSessionToken,
    );
    if (!session || session.shopDomain !== shopDomain) {
      throw deviceError("invalid_mobile_session", 401);
    }
    customerId = session.customerId;
  }

  const existing = await db.deviceToken.findFirst({
    where: {
      mobileAppId: mobileApp.id,
      shopDomain,
      token,
      isActive: true,
    },
  });

  if (existing) {
    const updated = await db.deviceToken.update({
      where: { id: existing.id },
      data: {
        platform,
        customerId: customerId ?? existing.customerId,
        lastSeenAt: new Date(),
      },
    });
    return toPublicDevice(updated);
  }

  const created = await db.deviceToken.create({
    data: {
      shopDomain,
      mobileAppId: mobileApp.id,
      token,
      platform,
      customerId,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
  return toPublicDevice(created);
}

export async function unregisterDeviceToken(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const token = normalizeToken(input.token);
  const registrationKey = String(input.registrationKey || "").trim();
  if (!registrationKey) throw deviceError("registration_key_required", 401);

  const mobileApp = await db.mobileApp.findUnique({ where: { shopDomain } });
  if (!mobileApp?.registrationKeyHash) {
    throw deviceError("registration_key_not_configured", 503);
  }
  if (!registrationKeysMatch(mobileApp.registrationKeyHash, registrationKey)) {
    throw deviceError("invalid_registration_key", 401);
  }

  const result = await db.deviceToken.updateMany({
    where: {
      shopDomain,
      mobileAppId: mobileApp.id,
      token,
      isActive: true,
    },
    data: { isActive: false },
  });

  return { unregistered: result.count > 0 };
}

function toPublicDevice(row) {
  return {
    id: row.id,
    shopDomain: row.shopDomain,
    mobileAppId: row.mobileAppId,
    platform: row.platform,
    isActive: row.isActive,
    customerId: row.customerId,
    lastSeenAt: row.lastSeenAt?.toISOString?.() || null,
  };
}

function normalizeToken(value) {
  const token = String(value || "").trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw deviceError("invalid_device_token", 400);
  }
  return token;
}

function normalizePlatform(value) {
  const platform = String(value || "").trim().toUpperCase();
  if (!PLATFORMS.has(platform)) throw deviceError("invalid_platform", 400);
  return platform;
}

function requireShop(value) {
  const shopDomain = normalizeShopDomain(value);
  if (!shopDomain) throw deviceError("invalid_shop", 400);
  return shopDomain;
}

function deviceError(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  return error;
}
