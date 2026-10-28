export function createMemoryOrderStore() {
  const shops = new Set();
  const webhooks = new Set();
  const orders = new Map();
  const guest = new Map();
  const key = (shop, id) => `${shop}::${id}`;

  return {
    async ensureShop(shopDomain) {
      shops.add(shopDomain);
    },
    async claimWebhook(_shop, webhookId) {
      if (webhooks.has(webhookId)) return false;
      webhooks.add(webhookId);
      return true;
    },
    async upsertOrder(order) {
      const k = key(order.shopDomain, order.shopifyOrderId);
      const prev = orders.get(k);
      if (!prev) {
        orders.set(k, order);
        return "inserted";
      }
      if (Date.parse(order.updatedAt) < Date.parse(prev.updatedAt)) {
        return "ignored";
      }
      orders.set(k, { ...prev, ...order, payload: mergePayload(prev.payload, order.payload) });
      return "updated";
    },
    async getOrder(shopDomain, shopifyOrderId) {
      return orders.get(key(shopDomain, shopifyOrderId)) || null;
    },
    async listOrdersForCustomer(shopDomain, customerId) {
      return [...orders.values()]
        .filter((row) => row.shopDomain === shopDomain && row.customerId === customerId)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    async findByCheckoutToken(shopDomain, checkoutToken) {
      for (const row of orders.values()) {
        if (row.shopDomain === shopDomain && row.checkoutToken === checkoutToken) {
          return row;
        }
      }
      return null;
    },
    async findByEmailAndOrderNumber(shopDomain, email, orderNumber) {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedNumber = normalizeOrderNumber(orderNumber);
      for (const row of orders.values()) {
        if (row.shopDomain !== shopDomain) continue;
        const rowEmail = (row.customerEmail || "").trim().toLowerCase();
        const rowNumber = normalizeOrderNumber(row.orderNumber || "");
        if (rowEmail === normalizedEmail && rowNumber === normalizedNumber) {
          return row;
        }
      }
      return null;
    },
    async createGuestToken(input) {
      guest.set(input.tokenHash, {
        shopDomain: input.shopDomain,
        shopifyOrderId: input.shopifyOrderId,
        expiresAt: input.expiresAt,
      });
    },
    async consumeGuestToken(tokenHash, nowIso) {
      const row = guest.get(tokenHash);
      if (!row || row.consumedAt) return null;
      if (Date.parse(row.expiresAt) < Date.parse(nowIso)) return null;
      row.consumedAt = nowIso;
      return { shopDomain: row.shopDomain, shopifyOrderId: row.shopifyOrderId };
    },
  };
}

export function normalizeOrderNumber(value) {
  return String(value || "")
    .trim()
    .replace(/^#/, "")
    .toLowerCase();
}

function mergePayload(existing, incoming) {
  if (!incoming?.__fulfillmentOnly) return incoming;
  const fulfillments = [...(existing.fulfillments || [])];
  for (const next of incoming.fulfillments || []) {
    const index = fulfillments.findIndex((row) => String(row.id) === String(next.id));
    if (index >= 0) fulfillments[index] = { ...fulfillments[index], ...next };
    else fulfillments.push(next);
  }
  return {
    ...existing,
    updated_at: incoming.updated_at || existing.updated_at,
    fulfillment_status:
      incoming.fulfillment_status || existing.fulfillment_status,
    fulfillments,
  };
}
