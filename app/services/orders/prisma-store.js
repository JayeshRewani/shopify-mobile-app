import db from "../../db.server";
import { normalizeOrderNumber } from "./memory-store.js";

function toStored(row) {
  if (!row) return null;
  return {
    shopDomain: row.shopDomain,
    shopifyOrderId: row.shopifyOrderId,
    orderNumber: row.orderNumber,
    customerId: row.customerId,
    customerEmail: row.customerEmail,
    updatedAt: row.shopifyUpdatedAt.toISOString(),
    checkoutToken: row.checkoutToken,
    payload: row.payloadJson,
  };
}

function mergePayload(existing, incoming) {
  if (!incoming?.__fulfillmentOnly) return incoming;
  const fulfillments = [...(existing?.fulfillments || [])];
  for (const next of incoming.fulfillments || []) {
    const index = fulfillments.findIndex((row) => String(row.id) === String(next.id));
    if (index >= 0) fulfillments[index] = { ...fulfillments[index], ...next };
    else fulfillments.push(next);
  }
  return {
    ...(existing || {}),
    ...incoming,
    __fulfillmentOnly: undefined,
    fulfillments,
    line_items: existing?.line_items || incoming.line_items || [],
    financial_status:
      existing?.financial_status ?? incoming.financial_status ?? null,
    email: existing?.email || incoming.email || null,
    customer: existing?.customer || incoming.customer || null,
    checkout_token: existing?.checkout_token || incoming.checkout_token || null,
    cart_token: existing?.cart_token || incoming.cart_token || null,
  };
}

export function createPrismaOrderStore(prisma = db) {
  return {
    async ensureShop(shopDomain) {
      await prisma.orderShop.upsert({
        where: { shopDomain },
        create: { shopDomain },
        update: {},
      });
    },

    async claimWebhook(shopDomain, webhookId, topic, eventId = null) {
      try {
        await prisma.webhookDelivery.create({
          data: {
            webhookId,
            shopDomain,
            topic,
            eventId: eventId || null,
          },
        });
        return true;
      } catch (error) {
        if (error?.code === "P2002") return false;
        throw error;
      }
    },

    async upsertOrder(order) {
      const existing = await prisma.syncedOrder.findUnique({
        where: {
          shopDomain_shopifyOrderId: {
            shopDomain: order.shopDomain,
            shopifyOrderId: order.shopifyOrderId,
          },
        },
      });

      if (existing) {
        if (
          Date.parse(order.updatedAt) <
          Date.parse(existing.shopifyUpdatedAt.toISOString())
        ) {
          return "ignored";
        }
        const payload = mergePayload(existing.payloadJson, order.payload);
        await prisma.syncedOrder.update({
          where: {
            shopDomain_shopifyOrderId: {
              shopDomain: order.shopDomain,
              shopifyOrderId: order.shopifyOrderId,
            },
          },
          data: {
            orderNumber: order.orderNumber ?? existing.orderNumber,
            customerId: order.customerId ?? existing.customerId,
            customerEmail: order.customerEmail ?? existing.customerEmail,
            financialStatus:
              payload.financial_status ?? existing.financialStatus,
            fulfillmentStatus:
              payload.fulfillment_status ?? existing.fulfillmentStatus,
            cancelledAt: payload.cancelled_at
              ? new Date(payload.cancelled_at)
              : existing.cancelledAt,
            currency: payload.currency ?? existing.currency,
            totalPrice:
              payload.total_price != null
                ? String(payload.total_price)
                : existing.totalPrice,
            checkoutToken: order.checkoutToken ?? existing.checkoutToken,
            shopifyUpdatedAt: new Date(order.updatedAt),
            payloadJson: payload,
          },
        });
        return "updated";
      }

      await prisma.syncedOrder.create({
        data: {
          shopDomain: order.shopDomain,
          shopifyOrderId: order.shopifyOrderId,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          customerEmail: order.customerEmail,
          financialStatus: order.payload?.financial_status || null,
          fulfillmentStatus: order.payload?.fulfillment_status || null,
          cancelledAt: order.payload?.cancelled_at
            ? new Date(order.payload.cancelled_at)
            : null,
          currency: order.payload?.currency || null,
          totalPrice:
            order.payload?.total_price != null
              ? String(order.payload.total_price)
              : null,
          checkoutToken: order.checkoutToken,
          shopifyUpdatedAt: new Date(order.updatedAt),
          payloadJson: order.payload,
        },
      });
      return "inserted";
    },

    async getOrder(shopDomain, shopifyOrderId) {
      const row = await prisma.syncedOrder.findUnique({
        where: {
          shopDomain_shopifyOrderId: { shopDomain, shopifyOrderId },
        },
      });
      return toStored(row);
    },

    async listOrdersForCustomer(shopDomain, customerId) {
      const rows = await prisma.syncedOrder.findMany({
        where: { shopDomain, customerId },
        orderBy: { shopifyUpdatedAt: "desc" },
      });
      return rows.map(toStored);
    },

    async findByCheckoutToken(shopDomain, checkoutToken) {
      const row = await prisma.syncedOrder.findFirst({
        where: { shopDomain, checkoutToken },
      });
      return toStored(row);
    },

    async findByEmailAndOrderNumber(shopDomain, email, orderNumber) {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedNumber = normalizeOrderNumber(orderNumber);
      const rows = await prisma.syncedOrder.findMany({
        where: {
          shopDomain,
          customerEmail: { equals: normalizedEmail, mode: "insensitive" },
        },
      });
      const match = rows.find(
        (row) => normalizeOrderNumber(row.orderNumber || "") === normalizedNumber,
      );
      return toStored(match || null);
    },

    async createGuestToken(input) {
      await prisma.guestOrderToken.create({
        data: {
          tokenHash: input.tokenHash,
          shopDomain: input.shopDomain,
          shopifyOrderId: input.shopifyOrderId,
          expiresAt: new Date(input.expiresAt),
        },
      });
    },

    async consumeGuestToken(tokenHash, nowIso) {
      const row = await prisma.guestOrderToken.findUnique({
        where: { tokenHash },
      });
      if (!row || row.consumedAt) return null;
      if (row.expiresAt.getTime() < Date.parse(nowIso)) return null;
      await prisma.guestOrderToken.update({
        where: { tokenHash },
        data: { consumedAt: new Date(nowIso) },
      });
      return {
        shopDomain: row.shopDomain,
        shopifyOrderId: row.shopifyOrderId,
      };
    },
  };
}

export const orderStore = createPrismaOrderStore();
