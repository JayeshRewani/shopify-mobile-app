import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hashSessionCookie(cookieHeader) {
  return createHash("sha256").update(cookieHeader).digest("hex");
}

export function issueMobileSessionToken(secret, claims) {
  const body = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyMobileSessionToken(
  secret,
  token,
  nowSec = Math.floor(Date.now() / 1000),
) {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    const left = Buffer.from(sig, "utf8");
    const right = Buffer.from(expected, "utf8");
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  } catch {
    return null;
  }
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!claims.shopDomain || !claims.customerId) return null;
    if (typeof claims.exp === "number" && claims.exp < nowSec) return null;
    return {
      shopDomain: claims.shopDomain,
      customerId: claims.customerId,
      email: claims.email ?? null,
    };
  } catch {
    return null;
  }
}

export function parseCustomerIdFromAccountHtml(html) {
  const match =
    html.match(/\/account\/orders\/(\d+)/) ||
    html.match(/customer_id["']?\s*[:=]\s*["']?(\d+)/i) ||
    html.match(/gid:\/\/shopify\/Customer\/(\d+)/);
  if (!match) return null;
  return `gid://shopify/Customer/${match[1]}`;
}

export function parseEmailFromAccountHtml(html) {
  const match = html.match(/mailto:([^"'>\s]+)/i);
  return match ? decodeURIComponent(match[1]) : null;
}
