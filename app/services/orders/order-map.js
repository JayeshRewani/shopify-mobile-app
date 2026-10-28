export function shopifyOrderGid(order) {
  if (order.admin_graphql_api_id) return String(order.admin_graphql_api_id);
  const id = order.id;
  if (id == null) throw new Error("order missing id");
  const n = String(id).replace(/^.*\//, "");
  return `gid://shopify/Order/${n}`;
}

export function customerIdFromOrder(order) {
  const id = order.customer?.id;
  if (id == null) return null;
  const n = String(id).replace(/^.*\//, "");
  return `gid://shopify/Customer/${n}`;
}

export function mapBuyerState(order) {
  if (order.cancelled_at) return "cancelled";
  const financial = (order.financial_status || "").toLowerCase();
  if (financial === "refunded") return "refunded";
  if (
    financial === "pending" ||
    financial === "authorized" ||
    financial === "partially_paid"
  ) {
    return "pending_payment";
  }
  const fulfillment = (order.fulfillment_status || "").toLowerCase();
  if (fulfillment === "fulfilled") return "fulfilled";
  if (fulfillment === "partial") return "partially_fulfilled";
  return "placed";
}

export function mapShipments(order) {
  const list = order.fulfillments || [];
  return list.map((fulfillment, index) => {
    const trackingNumber =
      fulfillment.tracking_number ||
      (Array.isArray(fulfillment.tracking_numbers) &&
        fulfillment.tracking_numbers[0]) ||
      null;
    const trackingUrl =
      fulfillment.tracking_url ||
      (Array.isArray(fulfillment.tracking_urls) &&
        fulfillment.tracking_urls[0]) ||
      null;
    return {
      id: String(fulfillment.id ?? `shipment-${index}`),
      status: (fulfillment.status || "pending").toLowerCase(),
      carrier: fulfillment.tracking_company || null,
      trackingNumber,
      trackingUrl,
      updatedAt: fulfillment.updated_at || fulfillment.created_at || null,
    };
  });
}

export function toOrderView(order, nowIso = new Date().toISOString()) {
  const lines = (order.line_items || []).map((line) => ({
    title: line.title || line.name || "Item",
    quantity: Number(line.quantity || 1),
    variantTitle: line.variant_title ?? null,
  }));
  return {
    id: shopifyOrderGid(order),
    orderNumber:
      order.name ||
      (order.order_number != null ? `#${order.order_number}` : null),
    createdAt: order.processed_at || order.created_at || null,
    updatedAt: order.updated_at || nowIso,
    currency: order.currency || null,
    totalPrice: order.total_price != null ? String(order.total_price) : null,
    financialStatus: order.financial_status || null,
    fulfillmentStatus: order.fulfillment_status || null,
    cancelledAt: order.cancelled_at || null,
    buyerState: mapBuyerState(order),
    lines,
    shipments: mapShipments(order),
  };
}

/** Prefer newer updated_at; equal timestamps keep / apply (first-write wins only when missing). */
export function shouldApplyOrderUpdate(existingUpdatedAt, incomingUpdatedAt) {
  if (!existingUpdatedAt) return true;
  if (!incomingUpdatedAt) return false;
  return Date.parse(incomingUpdatedAt) >= Date.parse(existingUpdatedAt);
}

/** Normalize fulfillment webhook payloads into an order-shaped snapshot when possible. */
export function orderPayloadFromWebhook(topic, payload) {
  const name = (topic || "").toLowerCase();
  if (name.startsWith("fulfillments/")) {
    const orderId = payload.order_id ?? payload.order?.id;
    if (orderId == null && !payload.admin_graphql_api_id) return null;
    const fulfillment = {
      id: payload.id,
      status: payload.status,
      tracking_company: payload.tracking_company,
      tracking_number: payload.tracking_number,
      tracking_numbers: payload.tracking_numbers,
      tracking_url: payload.tracking_url,
      tracking_urls: payload.tracking_urls,
      updated_at: payload.updated_at,
      created_at: payload.created_at,
    };
    return {
      id: orderId,
      admin_graphql_api_id:
        payload.order?.admin_graphql_api_id ||
        (orderId != null ? `gid://shopify/Order/${orderId}` : undefined),
      updated_at: payload.updated_at || payload.created_at || new Date().toISOString(),
      fulfillment_status: payload.shipment_status || payload.status || "partial",
      fulfillments: [fulfillment],
      line_items: [],
      email: payload.email || null,
      customer: payload.customer || null,
      financial_status: null,
      checkout_token: null,
      cart_token: null,
      __fulfillmentOnly: true,
    };
  }
  return payload;
}
