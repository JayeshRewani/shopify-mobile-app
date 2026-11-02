export function createPrismaStore(prisma) {
  return {
    async getCampaign(message) {
      return prisma.notificationCampaign.findFirst({
        where: {
          id: message.campaignId,
          shopDomain: message.shopDomain,
          mobileAppId: message.mobileAppId,
        },
      });
    },

    async getDatabaseCredential(shopDomain, mobileAppId) {
      const row = await prisma.firebaseCredential.findFirst({
        where: { shopDomain, mobileAppId, storage: "DATABASE" },
        select: {
          shopDomain: true,
          mobileAppId: true,
          serviceAccountJson: true,
        },
      });
      if (!row?.serviceAccountJson) return null;
      return {
        shopDomain: row.shopDomain,
        mobileAppId: row.mobileAppId,
        serviceAccount: JSON.parse(row.serviceAccountJson),
      };
    },

    async claimDevices(query) {
      return prisma.deviceToken.findMany({
        where: deviceWhere(query),
        orderBy: { id: "asc" },
        take: query.limit,
        select: {
          id: true,
          token: true,
          platform: true,
          shopDomain: true,
          mobileAppId: true,
        },
      });
    },

    async hasMore(query) {
      const row = await prisma.deviceToken.findFirst({
        where: deviceWhere(query),
        select: { id: true },
      });
      return Boolean(row);
    },

    async recordResults(campaign, results) {
      for (const result of results) {
        await prisma.notificationDelivery.upsert({
          where: {
            campaignId_deviceTokenId: {
              campaignId: campaign.id,
              deviceTokenId: result.deviceTokenId,
            },
          },
          create: deliveryData(campaign, result),
          update: {
            status: result.status,
            providerMessageId: result.providerMessageId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            attemptedAt: new Date(),
          },
        });
      }
      await prisma.notificationCampaign.updateMany({
        where: { id: campaign.id, shopDomain: campaign.shopDomain },
        data: {
          attemptedCount: { increment: results.length },
          acceptedCount: {
            increment: results.filter((result) => result.status === "ACCEPTED").length,
          },
          failedCount: {
            increment: results.filter((result) => result.status === "FAILED").length,
          },
          invalidTokenCount: {
            increment: results.filter((result) => result.status === "INVALID_TOKEN").length,
          },
        },
      });
    },

    async deactivateTokens(shopDomain, mobileAppId, ids) {
      await prisma.deviceToken.updateMany({
        where: { id: { in: ids }, shopDomain, mobileAppId },
        data: { isActive: false },
      });
    },

    async markCompleted(campaign) {
      await prisma.notificationCampaign.updateMany({
        where: {
          id: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
          status: "PROCESSING",
        },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    },

    async markFailed(campaign, reason) {
      await prisma.notificationCampaign.updateMany({
        where: {
          id: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
        },
        data: { status: "FAILED", completedAt: new Date() },
      });
      await prisma.notificationJob.updateMany({
        where: {
          campaignId: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
        },
        data: { status: "FAILED", lastError: reason },
      });
    },

    async markCancelled(campaign) {
      await prisma.notificationCampaign.updateMany({
        where: {
          id: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
          status: { in: ["DRAFT", "SCHEDULED", "PROCESSING"] },
        },
        data: { status: "CANCELLED", cancelRequested: true, completedAt: new Date() },
      });
    },

    async claimDueScheduled(now) {
      const due = await prisma.notificationCampaign.findMany({
        where: {
          status: "SCHEDULED",
          cancelRequested: false,
          scheduledAt: { lte: now },
        },
        orderBy: { scheduledAt: "asc" },
        take: 20,
      });
      const claimed = [];
      for (const campaign of due) {
        const updated = await prisma.notificationCampaign.updateMany({
          where: {
            id: campaign.id,
            shopDomain: campaign.shopDomain,
            mobileAppId: campaign.mobileAppId,
            status: "SCHEDULED",
            cancelRequested: false,
          },
          data: { status: "PROCESSING", startedAt: now },
        });
        if (updated.count !== 1) continue;
        const job = await prisma.notificationJob.upsert({
          where: {
            campaignId_shopDomain_mobileAppId: {
              campaignId: campaign.id,
              shopDomain: campaign.shopDomain,
              mobileAppId: campaign.mobileAppId,
            },
          },
          create: {
            campaignId: campaign.id,
            shopDomain: campaign.shopDomain,
            mobileAppId: campaign.mobileAppId,
            status: "QUEUED",
          },
          update: { status: "QUEUED", lastError: null },
        });
        claimed.push({ ...campaign, status: "PROCESSING", jobId: job.id });
      }
      return claimed;
    },

    async releaseClaim(campaign) {
      await prisma.notificationCampaign.updateMany({
        where: {
          id: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
          status: "PROCESSING",
        },
        data: { status: "SCHEDULED", startedAt: null },
      });
    },
  };
}

function deviceWhere(query) {
  const where = {
    shopDomain: query.shopDomain,
    mobileAppId: query.mobileAppId,
    isActive: true,
    deliveries: {
      none: {
        campaignId: query.campaignId,
        status: "ACCEPTED",
      },
    },
  };
  if (query.deviceTokenId) {
    where.id = query.deviceTokenId;
  } else if (query.cursor) {
    where.id = { gt: query.cursor };
  }
  const platform =
    query.audienceType === "ANDROID" || query.audienceType === "IOS"
      ? query.audienceType
      : query.platform;
  if (platform === "ANDROID" || platform === "IOS") {
    where.platform = platform;
  }
  return where;
}

function deliveryData(campaign, result) {
  return {
    campaignId: campaign.id,
    deviceTokenId: result.deviceTokenId,
    shopDomain: campaign.shopDomain,
    status: result.status,
    providerMessageId: result.providerMessageId,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage,
    attemptedAt: new Date(),
  };
}
