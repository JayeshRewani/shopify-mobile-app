import { createHash, randomBytes } from "node:crypto";
import { toOrderView } from "./order-map.js";
import { verifyMobileSessionToken } from "./customer-session.js";
import {
  issueMobileSessionToken,
  parseCustomerIdFromAccountHtml,
  parseEmailFromAccountHtml,
} from "./customer-session.js";

function unauthorized(error = "unauthorized") {
  return { ok: false, status: 401, error };
}

function rateLimited() {
  return { ok: false, status: 429, error: "rate_limited" };
}

export function assertShopBearer(authorization, expectedStorefrontToken) {
  if (!authorization || !expectedStorefrontToken) return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return match[1].trim() === expectedStorefrontToken;
}

export function resolveCustomerFromMobileSession(
  secret,
  mobileSessionHeader,
  shopDomain,
) {
  const customer = verifyMobileSessionToken(secret, mobileSessionHeader);
  if (!customer) return null;
  if (customer.shopDomain.toLowerCase() !== shopDomain.toLowerCase()) return null;
  return customer;
}

export function rejectClientOrderCreate() {
  return {
    ok: false,
    status: 410,
    error: "client_order_create_disabled",
  };
}

export async function listCustomerOrders(input) {
  if (!assertShopBearer(input.storefrontTokenHeader, input.expectedStorefrontToken)) {
    return unauthorized("invalid_app_token");
  }
  const customer = resolveCustomerFromMobileSession(
    input.sessionSecret,
    input.mobileSessionHeader,
    input.shopDomain,
  );
  if (!customer) return unauthorized("invalid_customer_session");

  const allowed = input.rateLimit.hit(
    `orders:list:${input.shopDomain}:${customer.customerId}:${input.clientIp}`,
    60_000,
    30,
  );
  if (!allowed) return rateLimited();

  const rows = await input.store.listOrdersForCustomer(
    input.shopDomain,
    customer.customerId,
  );
  return {
    ok: true,
    status: 200,
    body: { orders: rows.map((row) => toOrderView(row.payload, row.updatedAt)) },
  };
}

export async function getCustomerOrder(input) {
  if (!assertShopBearer(input.storefrontTokenHeader, input.expectedStorefrontToken)) {
    return unauthorized("invalid_app_token");
  }
  const customer = resolveCustomerFromMobileSession(
    input.sessionSecret,
    input.mobileSessionHeader,
    input.shopDomain,
  );
  if (!customer) return unauthorized("invalid_customer_session");

  const allowed = input.rateLimit.hit(
    `orders:get:${input.shopDomain}:${customer.customerId}:${input.clientIp}`,
    60_000,
    60,
  );
  if (!allowed) return rateLimited();

  const row = await input.store.getOrder(input.shopDomain, input.orderId);
  if (!row || row.customerId !== customer.customerId) {
    return { ok: false, status: 404, error: "not_found" };
  }
  return {
    ok: true,
    status: 200,
    body: { order: toOrderView(row.payload, row.updatedAt) },
  };
}

export async function reconcileCheckoutOrder(input) {
  if (!assertShopBearer(input.storefrontTokenHeader, input.expectedStorefrontToken)) {
    return unauthorized("invalid_app_token");
  }
  const allowed = input.rateLimit.hit(
    `orders:reconcile:${input.shopDomain}:${input.clientIp}`,
    60_000,
    20,
  );
  if (!allowed) return rateLimited();

  const customer = resolveCustomerFromMobileSession(
    input.sessionSecret,
    input.mobileSessionHeader,
    input.shopDomain,
  );

  let row = null;
  if (input.checkoutToken) {
    row = await input.store.findByCheckoutToken(
      input.shopDomain,
      input.checkoutToken,
    );
  }
  if (!row && input.orderIdHint) {
    row = await input.store.getOrder(input.shopDomain, input.orderIdHint);
  }

  if (!row) {
    return {
      ok: true,
      status: 202,
      body: { status: "pending_sync", retryAfterMs: 2500 },
    };
  }

  if (customer && row.customerId && row.customerId !== customer.customerId) {
    return { ok: false, status: 404, error: "not_found" };
  }

  if (!customer && !input.checkoutToken) {
    const email = (input.checkoutEmail || "").trim().toLowerCase();
    const orderEmail = (row.customerEmail || "").trim().toLowerCase();
    const created = Date.parse(
      row.payload.processed_at || row.payload.created_at || row.updatedAt,
    );
    const now = input.nowMs ?? Date.now();
    const fresh = Number.isFinite(created) && now - created < 30 * 60_000;
    if (!email || !orderEmail || email !== orderEmail || !fresh) {
      return {
        ok: true,
        status: 202,
        body: { status: "pending_sync", retryAfterMs: 2500 },
      };
    }
  }

  return {
    ok: true,
    status: 200,
    body: { status: "ready", order: toOrderView(row.payload, row.updatedAt) },
  };
}

export async function requestGuestOrderAccess(input) {
  if (!assertShopBearer(input.storefrontTokenHeader, input.expectedStorefrontToken)) {
    return unauthorized("invalid_app_token");
  }
  const allowed = input.rateLimit.hit(
    `orders:guest:${input.shopDomain}:${input.clientIp}`,
    60 * 60_000,
    5,
  );
  if (!allowed) return rateLimited();

  const email = input.email.trim().toLowerCase();
  const orderNumber = input.orderNumber.trim();
  if (!email.includes("@") || !orderNumber) {
    return { ok: false, status: 400, error: "invalid_input" };
  }

  const found = await input.findOrder();
  if (found && found.customerEmail && found.customerEmail.toLowerCase() === email) {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    await input.store.createGuestToken({
      tokenHash,
      shopDomain: input.shopDomain,
      shopifyOrderId: found.shopifyOrderId,
      expiresAt,
    });
    if (typeof input.onTokenIssued === "function") {
      await input.onTokenIssued({
        rawToken: raw,
        shopDomain: input.shopDomain,
        email,
        orderNumber,
      });
    }
  }

  return { ok: true, status: 200, body: { sent: true } };
}

export async function redeemGuestOrderToken(input) {
  if (!assertShopBearer(input.storefrontTokenHeader, input.expectedStorefrontToken)) {
    return unauthorized("invalid_app_token");
  }
  const allowed = input.rateLimit.hit(
    `orders:guest-redeem:${input.shopDomain}:${input.clientIp}`,
    60_000,
    10,
  );
  if (!allowed) return rateLimited();

  const tokenHash = createHash("sha256").update(input.rawToken).digest("hex");
  const consumed = await input.store.consumeGuestToken(
    tokenHash,
    new Date().toISOString(),
  );
  if (!consumed || consumed.shopDomain !== input.shopDomain) {
    return { ok: false, status: 404, error: "not_found" };
  }
  const row = await input.store.getOrder(
    consumed.shopDomain,
    consumed.shopifyOrderId,
  );
  if (!row) return { ok: false, status: 404, error: "not_found" };
  return {
    ok: true,
    status: 200,
    body: { order: toOrderView(row.payload, row.updatedAt) },
  };
}

export async function exchangeClassicCustomerSession(input) {
  const auth = input.storefrontTokenHeader?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!auth || auth !== input.expectedStorefrontToken) {
    return { ok: false, status: 401, error: "invalid_app_token" };
  }
  const cookie = (input.customerCookie || "").trim();
  if (!cookie) {
    return { ok: false, status: 401, error: "missing_customer_cookie" };
  }
  const allowed = input.rateLimit.hit(
    `session:exchange:${input.shopDomain}:${input.clientIp}`,
    60_000,
    20,
  );
  if (!allowed) {
    return { ok: false, status: 429, error: "rate_limited" };
  }

  const probe = await input.probeAccountHtml(cookie);
  if (!probe.ok) {
    return { ok: false, status: 401, error: "invalid_customer_session" };
  }
  const customerId = parseCustomerIdFromAccountHtml(probe.html);
  if (!customerId) {
    return { ok: false, status: 401, error: "customer_not_verified" };
  }
  const ttlSec = input.ttlSec ?? 3600;
  const token = issueMobileSessionToken(input.sessionSecret, {
    shopDomain: input.shopDomain.toLowerCase(),
    customerId,
    email: parseEmailFromAccountHtml(probe.html),
    exp: Math.floor(Date.now() / 1000) + ttlSec,
  });
  return {
    ok: true,
    status: 200,
    body: { mobileSessionToken: token, expiresInSec: ttlSec },
  };
}
