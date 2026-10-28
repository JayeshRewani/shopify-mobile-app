import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyShopifyWebhookHmac } from "./hmac.js";
import {
  mapBuyerState,
  shouldApplyOrderUpdate,
  toOrderView,
} from "./order-map.js";
import {
  issueMobileSessionToken,
  verifyMobileSessionToken,
} from "./customer-session.js";
import { createMemoryRateLimit } from "./rate-limit.js";
import { createMemoryOrderStore } from "./memory-store.js";
import { handleShopifyOrderWebhook } from "./webhooks.js";
import {
  exchangeClassicCustomerSession,
  getCustomerOrder,
  listCustomerOrders,
  reconcileCheckoutOrder,
  redeemGuestOrderToken,
  rejectClientOrderCreate,
  requestGuestOrderAccess,
} from "./handlers.js";

const SECRET = "shpss_test_secret";
const STOREFRONT = "shpat_storefront_test";
const SHOP = "warriortribe-in.myshopify.com";

function sign(body) {
  return createHmac("sha256", SECRET).update(body).digest("base64");
}

describe("webhook HMAC + dedupe + out-of-order", () => {
  it("rejects invalid signatures", async () => {
    const store = createMemoryOrderStore();
    const body = Buffer.from(
      JSON.stringify({ id: 1, updated_at: "2026-01-01T00:00:00Z" }),
    );
    const res = await handleShopifyOrderWebhook({
      rawBody: body,
      hmacHeader: "bad",
      topic: "orders/create",
      shopDomain: SHOP,
      webhookId: "w1",
      apiSecret: SECRET,
      store,
    });
    assert.deepEqual(res, { ok: false, status: 401, error: "invalid_hmac" });
  });

  it("accepts valid HMAC and ignores duplicates", async () => {
    const store = createMemoryOrderStore();
    const payload = {
      id: 99,
      admin_graphql_api_id: "gid://shopify/Order/99",
      name: "#1001",
      customer: { id: 7 },
      financial_status: "paid",
      fulfillment_status: null,
      updated_at: "2026-01-02T00:00:00Z",
      checkout_token: "chk_abc",
      line_items: [{ title: "Tee", quantity: 1 }],
    };
    const raw = Buffer.from(JSON.stringify(payload));
    const hmac = sign(raw.toString("utf8"));
    const first = await handleShopifyOrderWebhook({
      rawBody: raw,
      hmacHeader: hmac,
      topic: "orders/create",
      shopDomain: SHOP,
      webhookId: "wh-1",
      apiSecret: SECRET,
      store,
    });
    assert.equal(first.ok, true);
    const dup = await handleShopifyOrderWebhook({
      rawBody: raw,
      hmacHeader: hmac,
      topic: "orders/create",
      shopDomain: SHOP,
      webhookId: "wh-1",
      apiSecret: SECRET,
      store,
    });
    assert.equal(dup.ok, true);
    assert.equal(dup.duplicate, true);
  });

  it("ignores stale out-of-order updates", () => {
    assert.equal(
      shouldApplyOrderUpdate("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z"),
      false,
    );
    assert.equal(
      shouldApplyOrderUpdate("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z"),
      true,
    );
  });
});

describe("buyer states + partial fulfillment", () => {
  it("does not mark paid-unfulfilled as on the way", () => {
    assert.equal(
      mapBuyerState({ financial_status: "paid", fulfillment_status: null }),
      "placed",
    );
  });

  it("maps partial fulfillments and shipments", () => {
    const view = toOrderView({
      id: 1,
      financial_status: "paid",
      fulfillment_status: "partial",
      updated_at: "2026-01-03T00:00:00Z",
      fulfillments: [
        {
          id: 10,
          status: "success",
          tracking_company: "Delhivery",
          tracking_number: "D123",
          tracking_url: "https://track.example/D123",
        },
      ],
      line_items: [
        { title: "A", quantity: 1 },
        { title: "B", quantity: 1 },
      ],
    });
    assert.equal(view.buyerState, "partially_fulfilled");
    assert.equal(view.shipments.length, 1);
    assert.equal(view.shipments[0].carrier, "Delhivery");
    assert.equal(view.shipments[0].trackingNumber, "D123");
  });
});

describe("authorization", () => {
  it("rejects client authoritative create with 410", () => {
    assert.deepEqual(rejectClientOrderCreate(), {
      ok: false,
      status: 410,
      error: "client_order_create_disabled",
    });
  });

  it("blocks order list without verified customer session", async () => {
    const store = createMemoryOrderStore();
    const rateLimit = createMemoryRateLimit();
    const res = await listCustomerOrders({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: null,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "1.1.1.1",
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 401);
  });

  it("returns only orders for the verified customer and 404s cross-customer", async () => {
    const store = createMemoryOrderStore();
    await store.upsertOrder({
      shopDomain: SHOP,
      shopifyOrderId: "gid://shopify/Order/1",
      orderNumber: "#1",
      customerId: "gid://shopify/Customer/7",
      customerEmail: "a@example.com",
      updatedAt: "2026-01-01T00:00:00Z",
      checkoutToken: null,
      payload: {
        id: 1,
        admin_graphql_api_id: "gid://shopify/Order/1",
        customer: { id: 7 },
        financial_status: "paid",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });
    await store.upsertOrder({
      shopDomain: SHOP,
      shopifyOrderId: "gid://shopify/Order/2",
      orderNumber: "#2",
      customerId: "gid://shopify/Customer/8",
      customerEmail: "b@example.com",
      updatedAt: "2026-01-01T00:00:00Z",
      checkoutToken: null,
      payload: {
        id: 2,
        admin_graphql_api_id: "gid://shopify/Order/2",
        customer: { id: 8 },
        financial_status: "paid",
        updated_at: "2026-01-01T00:00:00Z",
      },
    });

    const token = issueMobileSessionToken(SECRET, {
      shopDomain: SHOP,
      customerId: "gid://shopify/Customer/7",
      email: "a@example.com",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const rateLimit = createMemoryRateLimit();
    const res = await listCustomerOrders({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: token,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "1.1.1.1",
    });
    assert.equal(res.ok, true);
    assert.equal(res.body.orders.length, 1);
    assert.equal(res.body.orders[0].id, "gid://shopify/Order/1");

    const other = await getCustomerOrder({
      shopDomain: SHOP,
      orderId: "gid://shopify/Order/2",
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: token,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "1.1.1.1",
    });
    assert.equal(other.ok, false);
    assert.equal(other.status, 404);
  });

  it("rejects forged or expired session tokens", () => {
    const token = issueMobileSessionToken(SECRET, {
      shopDomain: SHOP,
      customerId: "gid://shopify/Customer/7",
      email: null,
      exp: Math.floor(Date.now() / 1000) - 10,
    });
    assert.equal(verifyMobileSessionToken(SECRET, token), null);
  });
});

describe("delayed sync + guest", () => {
  it("returns pending_sync until webhook arrives then ready", async () => {
    const store = createMemoryOrderStore();
    const rateLimit = createMemoryRateLimit();
    const pending = await reconcileCheckoutOrder({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: null,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "2.2.2.2",
      checkoutToken: "chk_pending",
    });
    assert.equal(pending.ok, true);
    assert.equal(pending.status, 202);
    assert.equal(pending.body.status, "pending_sync");

    await store.upsertOrder({
      shopDomain: SHOP,
      shopifyOrderId: "gid://shopify/Order/55",
      orderNumber: "#55",
      customerId: null,
      customerEmail: "g@example.com",
      updatedAt: "2026-01-04T00:00:00Z",
      checkoutToken: "chk_pending",
      payload: {
        id: 55,
        financial_status: "paid",
        fulfillment_status: null,
        updated_at: "2026-01-04T00:00:00Z",
      },
    });

    const ready = await reconcileCheckoutOrder({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: null,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "2.2.2.2",
      checkoutToken: "chk_pending",
    });
    assert.equal(ready.ok, true);
    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, "ready");
  });

  it("guest orderIdHint alone without fresh email match stays pending", async () => {
    const store = createMemoryOrderStore();
    await store.upsertOrder({
      shopDomain: SHOP,
      shopifyOrderId: "gid://shopify/Order/77",
      orderNumber: "#77",
      customerId: null,
      customerEmail: "owner@example.com",
      updatedAt: "2026-01-04T00:00:00Z",
      checkoutToken: null,
      payload: {
        id: 77,
        admin_graphql_api_id: "gid://shopify/Order/77",
        email: "owner@example.com",
        financial_status: "paid",
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    const rateLimit = createMemoryRateLimit();
    const denied = await reconcileCheckoutOrder({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      mobileSessionHeader: null,
      sessionSecret: SECRET,
      store,
      rateLimit,
      clientIp: "4.4.4.4",
      orderIdHint: "gid://shopify/Order/77",
      checkoutEmail: "attacker@example.com",
    });
    assert.equal(denied.ok, true);
    assert.equal(denied.status, 202);
    assert.equal(denied.body.status, "pending_sync");
  });

  it("guest request never exposes orders and always returns sent", async () => {
    const store = createMemoryOrderStore();
    const rateLimit = createMemoryRateLimit();
    const res = await requestGuestOrderAccess({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      store,
      rateLimit,
      clientIp: "3.3.3.3",
      email: "nobody@example.com",
      orderNumber: "#999",
      findOrder: async () => null,
    });
    assert.deepEqual(res, { ok: true, status: 200, body: { sent: true } });
  });

  it("expired guest token cannot be redeemed", async () => {
    const store = createMemoryOrderStore();
    const rateLimit = createMemoryRateLimit();
    const { createHash, randomBytes } = await import("node:crypto");
    const raw = randomBytes(16).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await store.createGuestToken({
      tokenHash,
      shopDomain: SHOP,
      shopifyOrderId: "gid://shopify/Order/1",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await redeemGuestOrderToken({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      store,
      rateLimit,
      clientIp: "5.5.5.5",
      rawToken: raw,
    });
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
  });
});

describe("hmac helper", () => {
  it("timing-safe compares digests", () => {
    const body = Buffer.from('{"a":1}');
    const good = sign(body.toString("utf8"));
    assert.equal(verifyShopifyWebhookHmac(body, good, SECRET), true);
    assert.equal(verifyShopifyWebhookHmac(body, "x", SECRET), false);
  });
});

describe("classic session exchange", () => {
  it("issues token only after server-side cookie probe", async () => {
    const rateLimit = createMemoryRateLimit();
    const bad = await exchangeClassicCustomerSession({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      customerCookie: "x",
      sessionSecret: SECRET,
      rateLimit,
      clientIp: "9.9.9.9",
      probeAccountHtml: async () => ({ ok: false, html: "" }),
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, 401);

    const good = await exchangeClassicCustomerSession({
      shopDomain: SHOP,
      storefrontTokenHeader: `Bearer ${STOREFRONT}`,
      expectedStorefrontToken: STOREFRONT,
      customerCookie: "session=abc",
      sessionSecret: SECRET,
      rateLimit,
      clientIp: "9.9.9.9",
      probeAccountHtml: async () => ({
        ok: true,
        html: '<a href="/account/orders/123">Order</a> mailto:a@example.com',
      }),
    });
    assert.equal(good.ok, true);
    const claims = verifyMobileSessionToken(SECRET, good.body.mobileSessionToken);
    assert.equal(claims?.customerId, "gid://shopify/Customer/123");
  });
});
