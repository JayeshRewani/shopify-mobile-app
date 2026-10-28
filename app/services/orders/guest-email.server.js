/**
 * Emails a one-time guest order deep link.
 * Never logs the raw token.
 */
export async function sendGuestOrderAccessEmail({
  email,
  shopDomain,
  orderNumber,
  rawToken,
}) {
  const base =
    process.env.GUEST_ORDER_DEEP_LINK_BASE ||
    process.env.SHOPIFY_APP_URL ||
    "";
  const link = base
    ? `${base.replace(/\/$/, "")}/orders/guest?token=${encodeURIComponent(rawToken)}&shop=${encodeURIComponent(shopDomain)}`
    : null;

  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_ACCESS_FROM_EMAIL;

  if (resendKey && from && link) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `Order access for ${orderNumber}`,
        text: `Use this one-time link to view order ${orderNumber}. It expires in 30 minutes.\n\n${link}`,
      }),
    });
    if (!response.ok) {
      console.info("guest_order_email_failed", {
        shopDomain,
        status: response.status,
      });
      return false;
    }
    console.info("guest_order_email_sent", { shopDomain });
    return true;
  }

  console.info("guest_order_email_queued", {
    shopDomain,
    hasLinkBase: Boolean(base),
  });
  return false;
}
