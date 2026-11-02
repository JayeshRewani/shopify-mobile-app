const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

const TRANSIENT_CODES = new Set([
  "messaging/internal-error",
  "messaging/server-unavailable",
  "messaging/quota-exceeded",
  "messaging/unavailable",
  "messaging/unknown-error",
]);

export function classifyFcmResponse(item, device) {
  if (item?.success) {
    return {
      deviceTokenId: device.id,
      status: "ACCEPTED",
      providerMessageId: item.messageId || null,
      errorCode: null,
      errorMessage: null,
      transient: false,
    };
  }
  const code = item?.error?.code || "unknown";
  const errorMessage = safeErrorMessage(item?.error?.message);
  if (INVALID_TOKEN_CODES.has(code)) {
    return {
      deviceTokenId: device.id,
      status: "INVALID_TOKEN",
      providerMessageId: null,
      errorCode: code,
      errorMessage,
      transient: false,
    };
  }
  return {
    deviceTokenId: device.id,
    status: "FAILED",
    providerMessageId: null,
    errorCode: code,
    errorMessage,
    transient: TRANSIENT_CODES.has(code),
  };
}

export function buildFcmMessage(campaign, device) {
  return {
    token: device.token,
    notification: {
      title: campaign.title,
      body: campaign.message,
      ...(campaign.imageUrl ? { imageUrl: campaign.imageUrl } : {}),
    },
    data: {
      campaignId: campaign.id,
      shopDomain: campaign.shopDomain,
      deepLink: campaign.deepLink || "",
    },
    android: { collapseKey: campaign.id },
    apns: { headers: { "apns-collapse-id": campaign.id } },
  };
}

function safeErrorMessage(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return value.replace(/private_key/gi, "[redacted]").slice(0, 300);
}
