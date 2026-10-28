import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify Shopify webhook HMAC against the raw request body (never re-serialized JSON). */
export function verifyShopifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader || !secret) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  try {
    const left = Buffer.from(digest, "utf8");
    const right = Buffer.from(hmacHeader, "utf8");
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
