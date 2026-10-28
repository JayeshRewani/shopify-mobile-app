import { authenticate } from "../shopify.server";
import { orderStore } from "../services/orders/prisma-store";
import { ingestVerifiedOrderWebhook } from "../services/orders/webhooks";

/**
 * Orders + fulfillments webhooks.
 * HMAC is verified by authenticate.webhook against the raw body.
 */
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  const webhookId = request.headers.get("x-shopify-webhook-id") || "";
  const eventId = request.headers.get("x-shopify-event-id");

  await ingestVerifiedOrderWebhook({
    shopDomain: shop,
    topic,
    webhookId,
    eventId,
    payload,
    store: orderStore,
  });

  return new Response();
};
