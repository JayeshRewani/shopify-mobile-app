import { normalizeShopDomain } from "../mobile-http.server.js";
import { buildJobMessage } from "./job-message.js";

export async function enqueueImmediateSend(db, sender, input) {
  const shopDomain = requireShop(input.shopDomain);
  const campaign = await db.notificationCampaign.findFirst({
    where: { id: input.campaignId, shopDomain },
  });
  if (!campaign) return { enqueued: false, reason: "not_found" };
  if (campaign.cancelRequested || !["DRAFT", "SCHEDULED"].includes(campaign.status)) {
    return { enqueued: false, reason: "not_sendable" };
  }

  const claimed = await db.notificationCampaign.updateMany({
    where: {
      id: campaign.id,
      shopDomain,
      status: campaign.status,
      cancelRequested: false,
    },
    data: { status: "PROCESSING", startedAt: new Date() },
  });
  if (claimed.count !== 1) return { enqueued: false, reason: "conflict" };

  const job = await db.notificationJob.upsert({
    where: {
      campaignId_shopDomain_mobileAppId: {
        campaignId: campaign.id,
        shopDomain,
        mobileAppId: campaign.mobileAppId,
      },
    },
    create: {
      campaignId: campaign.id,
      shopDomain,
      mobileAppId: campaign.mobileAppId,
      status: "QUEUED",
    },
    update: { status: "QUEUED", lastError: null },
  });

  try {
    await sender.send(
      buildJobMessage({
        action: "start",
        jobId: job.id,
        campaignId: campaign.id,
        shopDomain,
        mobileAppId: campaign.mobileAppId,
        cursor: null,
      }),
    );
  } catch (error) {
    await db.notificationCampaign.updateMany({
      where: { id: campaign.id, shopDomain, status: "PROCESSING" },
      data: { status: campaign.status, startedAt: campaign.startedAt },
    });
    throw error;
  }

  return { enqueued: true, jobId: job.id };
}

export async function scheduleCampaign(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const scheduledAt = input.scheduledAt instanceof Date ? input.scheduledAt : null;
  if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
    throw new Error("scheduled_at_must_be_future");
  }
  const updated = await db.notificationCampaign.updateMany({
    where: {
      id: input.campaignId,
      shopDomain,
      status: "DRAFT",
      cancelRequested: false,
    },
    data: { status: "SCHEDULED", scheduledAt },
  });
  return { scheduled: updated.count === 1 };
}

function requireShop(value) {
  const shopDomain = normalizeShopDomain(value);
  if (!shopDomain) throw new Error("invalid_shop");
  return shopDomain;
}
