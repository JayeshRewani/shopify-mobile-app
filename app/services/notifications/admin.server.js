import { normalizeShopDomain } from "../mobile-http.server.js";
import { rotateMobileAppRegistrationKey } from "./device-tokens.server.js";
import { enqueueImmediateSend, scheduleCampaign } from "./enqueue.server.js";
import { saveFirebaseServiceAccount, toPublicCredential } from "./firebase-credentials.server.js";
import { createMessageSender, createQueueClient } from "./sqs.server.js";

export async function ensureMobileApp(db, shopDomain) {
  const shop = requireShop(shopDomain);
  const existing = await db.mobileApp.findUnique({ where: { shopDomain: shop } });
  if (existing) return existing;
  return db.mobileApp.create({ data: { shopDomain: shop } });
}

export async function loadNotificationsAdmin(db, shopDomain) {
  const shop = requireShop(shopDomain);
  const mobileApp = await ensureMobileApp(db, shop);
  const [credential, campaigns, deviceCount] = await Promise.all([
    db.firebaseCredential.findFirst({
      where: { shopDomain: shop, mobileAppId: mobileApp.id },
      select: {
        shopDomain: true,
        mobileAppId: true,
        storage: true,
        serviceAccountJson: true,
        externalRef: true,
      },
    }),
    db.notificationCampaign.findMany({
      where: { shopDomain: shop, mobileAppId: mobileApp.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        name: true,
        title: true,
        message: true,
        audienceType: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        completedAt: true,
        targetedCount: true,
        attemptedCount: true,
        acceptedCount: true,
        failedCount: true,
        invalidTokenCount: true,
        createdAt: true,
      },
    }),
    db.deviceToken.count({
      where: { shopDomain: shop, mobileAppId: mobileApp.id, isActive: true },
    }),
  ]);

  return {
    shopDomain: shop,
    mobileApp: {
      id: mobileApp.id,
      androidPackageId: mobileApp.androidPackageId,
      iosBundleId: mobileApp.iosBundleId,
      firebaseProjectId: mobileApp.firebaseProjectId,
      hasRegistrationKey: Boolean(mobileApp.registrationKeyHash),
    },
    firebase: toPublicCredential(credential),
    deviceCount,
    campaigns,
  };
}

export async function rotateRegistrationKey(db, shopDomain) {
  await ensureMobileApp(db, shopDomain);
  return rotateMobileAppRegistrationKey(db, shopDomain);
}

export async function createDraftCampaign(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const mobileAppId = String(input.mobileAppId || "").trim();
  const name = String(input.name || "").trim();
  const title = String(input.title || "").trim();
  const message = String(input.message || "").trim();
  const audienceType = normalizeAudience(input.audienceType);

  if (!mobileAppId) throw adminError("mobile_app_required");
  if (!name || !title || !message) throw adminError("campaign_fields_required");

  const app = await db.mobileApp.findFirst({
    where: { id: mobileAppId, shopDomain },
    select: { id: true },
  });
  if (!app) throw adminError("mobile_app_not_found");

  return db.notificationCampaign.create({
    data: {
      shopDomain,
      mobileAppId,
      name,
      title,
      message,
      imageUrl: emptyToNull(input.imageUrl),
      deepLink: emptyToNull(input.deepLink),
      audienceType,
      platform: audienceType === "ANDROID" || audienceType === "IOS" ? audienceType : null,
      status: "DRAFT",
    },
  });
}

export async function saveFirebaseJson(db, input) {
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(String(input.serviceAccountText || ""));
  } catch {
    throw adminError("firebase_json_invalid");
  }
  return saveFirebaseServiceAccount(db, {
    shopDomain: input.shopDomain,
    mobileAppId: input.mobileAppId,
    serviceAccount,
  });
}

export async function sendCampaignNow(db, request, input) {
  const queueUrl = process.env.NOTIFICATIONS_QUEUE_URL;
  if (!queueUrl) throw adminError("queue_url_missing");
  const client = await createQueueClient(process.env, request);
  const sender = createMessageSender(client, queueUrl);
  return enqueueImmediateSend(db, sender, {
    shopDomain: input.shopDomain,
    campaignId: input.campaignId,
  });
}

export async function scheduleCampaignForShop(db, input) {
  const scheduledAt = new Date(String(input.scheduledAt || ""));
  if (Number.isNaN(scheduledAt.getTime())) throw adminError("schedule_invalid");
  return scheduleCampaign(db, {
    shopDomain: input.shopDomain,
    campaignId: input.campaignId,
    scheduledAt,
  });
}

function normalizeAudience(value) {
  const audience = String(value || "ALL").toUpperCase();
  if (!["ALL", "ANDROID", "IOS"].includes(audience)) {
    throw adminError("audience_invalid");
  }
  return audience;
}

function emptyToNull(value) {
  const text = String(value || "").trim();
  return text === "" ? null : text;
}

function requireShop(value) {
  const shopDomain = normalizeShopDomain(value);
  if (!shopDomain) throw adminError("invalid_shop");
  return shopDomain;
}

function adminError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
