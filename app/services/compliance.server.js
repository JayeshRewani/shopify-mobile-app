import db from "../db.server";

/**
 * Mandatory App Store compliance webhooks.
 * Respond 200 quickly after authenticating; complete deletion within 30 days.
 * @see https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance
 */

export function normalizeComplianceTopic(topic) {
  return String(topic || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "/");
}

/**
 * customers/data_request — acknowledge and record what we hold for the customer.
 * Store owners receive the data from apps; we log IDs for support follow-up.
 */
export async function handleCustomersDataRequest({ shop, payload }) {
  const shopDomain = shop || payload?.shop_domain || "";
  const customerId = payload?.customer?.id != null ? String(payload.customer.id) : null;
  const email = payload?.customer?.email
    ? String(payload.customer.email).trim().toLowerCase()
    : null;
  const ordersRequested = Array.isArray(payload?.orders_requested)
    ? payload.orders_requested.map(String)
    : [];

  const orderFilters = [
    ...(customerId ? [{ customerId }] : []),
    ...(email ? [{ customerEmail: email }] : []),
    ...(ordersRequested.length
      ? [{ shopifyOrderId: { in: ordersRequested } }]
      : []),
  ];

  const orders = orderFilters.length
    ? await db.syncedOrder.findMany({
        where: { shopDomain, OR: orderFilters },
        select: {
          shopifyOrderId: true,
          orderNumber: true,
          customerId: true,
          customerEmail: true,
          totalPrice: true,
          currency: true,
          shopifyUpdatedAt: true,
        },
      })
    : [];

  const devices = customerId
    ? await db.deviceToken.findMany({
        where: { shopDomain, customerId },
        select: { id: true, platform: true, isActive: true, lastSeenAt: true },
      })
    : [];

  console.info("compliance_customers_data_request", {
    shopDomain,
    dataRequestId: payload?.data_request?.id ?? null,
    customerId,
    email,
    ordersFound: orders.length,
    devicesFound: devices.length,
  });

  return { orders, devices };
}

/**
 * customers/redact — delete / redact customer-linked data we store.
 */
export async function handleCustomersRedact({ shop, payload }) {
  const shopDomain = shop || payload?.shop_domain || "";
  const customerId = payload?.customer?.id != null ? String(payload.customer.id) : null;
  const email = payload?.customer?.email
    ? String(payload.customer.email).trim().toLowerCase()
    : null;
  const ordersToRedact = Array.isArray(payload?.orders_to_redact)
    ? payload.orders_to_redact.map(String)
    : [];

  const orderWhere = {
    shopDomain,
    OR: [
      ...(customerId ? [{ customerId }] : []),
      ...(email ? [{ customerEmail: email }] : []),
      ...(ordersToRedact.length ? [{ shopifyOrderId: { in: ordersToRedact } }] : []),
    ],
  };

  if (!orderWhere.OR.length) {
    console.info("compliance_customers_redact_noop", { shopDomain });
    return { ordersDeleted: 0, devicesDeleted: 0, guestTokensDeleted: 0 };
  }

  const matchingOrders = await db.syncedOrder.findMany({
    where: orderWhere,
    select: { shopifyOrderId: true },
  });
  const orderIds = matchingOrders.map((row) => row.shopifyOrderId);

  const guestTokensDeleted = orderIds.length
    ? (
        await db.guestOrderToken.deleteMany({
          where: { shopDomain, shopifyOrderId: { in: orderIds } },
        })
      ).count
    : 0;

  const ordersDeleted = (await db.syncedOrder.deleteMany({ where: orderWhere })).count;

  const devicesDeleted = customerId
    ? (
        await db.deviceToken.deleteMany({
          where: { shopDomain, customerId },
        })
      ).count
    : 0;

  console.info("compliance_customers_redact", {
    shopDomain,
    customerId,
    email,
    ordersDeleted,
    devicesDeleted,
    guestTokensDeleted,
  });

  return { ordersDeleted, devicesDeleted, guestTokensDeleted };
}

/**
 * shop/redact — 48h after uninstall; purge all shop-scoped data we retain.
 */
export async function handleShopRedact({ shop, payload }) {
  const shopDomain = shop || payload?.shop_domain || "";
  if (!shopDomain) {
    console.info("compliance_shop_redact_missing_shop");
    return;
  }

  await db.session.deleteMany({ where: { shop: shopDomain } });
  await db.shopConfig.deleteMany({ where: { shop: shopDomain } });
  // Cascades: publish leads, mobile apps, devices, campaigns, firebase creds.
  await db.orderShop.deleteMany({ where: { shopDomain } });
  // Cascades: webhook deliveries, synced orders, guest tokens.

  await db.mobileRateLimit.deleteMany({
    where: { bucketKey: { contains: shopDomain } },
  }).catch(() => {});

  console.info("compliance_shop_redact", { shopDomain });
}
