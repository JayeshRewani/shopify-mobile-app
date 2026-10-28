import { verifyShopifyWebhookHmac } from "./hmac.js";
import {
  customerIdFromOrder,
  orderPayloadFromWebhook,
  shopifyOrderGid,
  shouldApplyOrderUpdate,
} from "./order-map.js";

const ORDER_TOPICS = new Set([
  "orders/create",
  "orders/updated",
  "orders/paid",
  "orders/cancelled",
  "orders/fulfilled",
  "orders/partially_fulfilled",
  "fulfillments/create",
  "fulfillments/update",
]);

export async function handleShopifyOrderWebhook(input) {
  if (
    !verifyShopifyWebhookHmac(input.rawBody, input.hmacHeader, input.apiSecret)
  ) {
    return { ok: false, status: 401, error: "invalid_hmac" };
  }

  const shop = (input.shopDomain || "").toLowerCase();
  const topic = (input.topic || "").toLowerCase();
  const webhookId = input.webhookId || "";
  if (!shop || !topic || !webhookId) {
    return { ok: false, status: 400, error: "missing_headers" };
  }
  if (
    !ORDER_TOPICS.has(topic) &&
    !topic.startsWith("orders/") &&
    !topic.startsWith("fulfillments/")
  ) {
    return { ok: true, status: 200, ignored: true };
  }

  await input.store.ensureShop(shop);
  const claimed = await input.store.claimWebhook(
    shop,
    webhookId,
    topic,
    input.eventId,
  );
  if (!claimed) {
    return { ok: true, status: 200, duplicate: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    return { ok: false, status: 400, error: "invalid_json" };
  }

  const payload = orderPayloadFromWebhook(topic, parsed);
  if (!payload || (payload.id == null && !payload.admin_graphql_api_id)) {
    return { ok: true, status: 200, ignored: true };
  }

  let shopifyOrderId;
  try {
    shopifyOrderId = shopifyOrderGid(payload);
  } catch {
    return { ok: true, status: 200, ignored: true };
  }

  const existing = await input.store.getOrder(shop, shopifyOrderId);
  if (payload.__fulfillmentOnly && !existing) {
    return { ok: true, status: 200, ignored: true };
  }
  if (
    existing &&
    !shouldApplyOrderUpdate(existing.updatedAt, payload.updated_at || null)
  ) {
    return { ok: true, status: 200, ignored: true };
  }

  const updatedAt = payload.updated_at || new Date().toISOString();
  const checkoutToken =
    (payload.checkout_token && String(payload.checkout_token)) ||
    (payload.cart_token && String(payload.cart_token)) ||
    existing?.checkoutToken ||
    null;

  await input.store.upsertOrder({
    shopDomain: shop,
    shopifyOrderId,
    orderNumber:
      payload.name ||
      (payload.order_number != null ? `#${payload.order_number}` : null) ||
      existing?.orderNumber ||
      null,
    customerId: customerIdFromOrder(payload) || existing?.customerId || null,
    customerEmail:
      payload.email ||
      payload.customer?.email ||
      existing?.customerEmail ||
      null,
    updatedAt,
    payload,
    checkoutToken,
  });

  return { ok: true, status: 200 };
}

/**
 * Process a webhook already verified by authenticate.webhook().
 * Still dedupes by X-Shopify-Webhook-Id and applies out-of-order rules.
 */
export async function ingestVerifiedOrderWebhook(input) {
  const shop = (input.shopDomain || "").toLowerCase();
  const topic = (input.topic || "").toLowerCase();
  const webhookId = input.webhookId || "";
  if (!shop || !topic || !webhookId) {
    return { ok: false, status: 400, error: "missing_headers" };
  }

  await input.store.ensureShop(shop);
  const claimed = await input.store.claimWebhook(
    shop,
    webhookId,
    topic,
    input.eventId,
  );
  if (!claimed) {
    return { ok: true, status: 200, duplicate: true };
  }

  const payload = orderPayloadFromWebhook(topic, input.payload);
  if (!payload || (payload.id == null && !payload.admin_graphql_api_id)) {
    return { ok: true, status: 200, ignored: true };
  }

  let shopifyOrderId;
  try {
    shopifyOrderId = shopifyOrderGid(payload);
  } catch {
    return { ok: true, status: 200, ignored: true };
  }

  const existing = await input.store.getOrder(shop, shopifyOrderId);
  if (payload.__fulfillmentOnly && !existing) {
    return { ok: true, status: 200, ignored: true };
  }
  if (
    existing &&
    !shouldApplyOrderUpdate(existing.updatedAt, payload.updated_at || null)
  ) {
    return { ok: true, status: 200, ignored: true };
  }

  const updatedAt = payload.updated_at || new Date().toISOString();
  await input.store.upsertOrder({
    shopDomain: shop,
    shopifyOrderId,
    orderNumber:
      payload.name ||
      (payload.order_number != null ? `#${payload.order_number}` : null) ||
      existing?.orderNumber ||
      null,
    customerId: customerIdFromOrder(payload) || existing?.customerId || null,
    customerEmail:
      payload.email ||
      payload.customer?.email ||
      existing?.customerEmail ||
      null,
    updatedAt,
    payload,
    checkoutToken:
      (payload.checkout_token && String(payload.checkout_token)) ||
      (payload.cart_token && String(payload.cart_token)) ||
      existing?.checkoutToken ||
      null,
  });

  return { ok: true, status: 200 };
}
