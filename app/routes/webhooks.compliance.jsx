import { authenticate } from "../shopify.server";
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
  normalizeComplianceTopic,
} from "../services/compliance.server";

/**
 * Mandatory App Store compliance webhooks.
 * HMAC is verified by authenticate.webhook (raw body + client secret).
 * Invalid HMAC → SDK responds 401; success → 200.
 */
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const normalized = normalizeComplianceTopic(topic);

  console.log(`Received compliance webhook ${normalized} for ${shop}`);

  switch (normalized) {
    case "customers/data_request":
      await handleCustomersDataRequest({ shop, payload });
      break;
    case "customers/redact":
      await handleCustomersRedact({ shop, payload });
      break;
    case "shop/redact":
      await handleShopRedact({ shop, payload });
      break;
    default:
      console.warn(`Unhandled compliance topic: ${topic}`);
      break;
  }

  return new Response();
};
