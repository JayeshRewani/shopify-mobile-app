import { unauthenticated } from "../../shopify.server";
import { adminGraphql } from "../admin-graphql.server";
import { normalizeOrderNumber } from "./memory-store.js";

/**
 * Look up an order by number + email via Admin GraphQL for the offline session.
 * Returns null on miss / access errors (guest endpoint must not leak existence).
 */
export async function findOrderByEmailAndNumber(shop, email, orderNumber) {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const number = normalizeOrderNumber(orderNumber);
    const query = `name:#${number} OR name:${number}`;
    const data = await adminGraphql(
      admin,
      `#graphql
        query GuestOrderLookup($query: String!) {
          orders(first: 5, query: $query) {
            nodes {
              id
              name
              email
            }
          }
        }`,
      { query },
    );

    const wantedEmail = email.trim().toLowerCase();
    const match = (data.orders?.nodes || []).find((node) => {
      const nodeNumber = normalizeOrderNumber(node.name || "");
      const nodeEmail = (node.email || "").trim().toLowerCase();
      return nodeNumber === number && nodeEmail === wantedEmail;
    });

    if (!match) return null;
    return {
      shopifyOrderId: match.id,
      customerEmail: match.email || null,
    };
  } catch (error) {
    console.info("guest_order_admin_lookup_failed", {
      shop,
      message: String(error?.message || "error"),
    });
    return null;
  }
}

export async function probeClassicAccount(shop, cookie) {
  try {
    const response = await fetch(`https://${shop}/account`, {
      method: "GET",
      redirect: "manual",
      headers: {
        Cookie: cookie,
        Accept: "text/html",
        "User-Agent": "ShopifyMobileApp/1.0",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, html: "" };
    }
    if (!response.ok) {
      return { ok: false, html: "" };
    }
    const html = await response.text();
    if (/\/account\/login/i.test(html) && !/\/account\/orders\//i.test(html)) {
      return { ok: false, html: "" };
    }
    return { ok: true, html };
  } catch {
    return { ok: false, html: "" };
  }
}
