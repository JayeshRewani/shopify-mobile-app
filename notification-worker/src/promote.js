import { buildJobMessage } from "./message.js";

export async function promoteDueCampaigns({ store, enqueue, now = new Date() }) {
  const claimed = await store.claimDueScheduled(now);
  let enqueued = 0;
  for (const campaign of claimed) {
    try {
      await enqueue(
        buildJobMessage({
          action: "start",
          jobId: campaign.jobId,
          campaignId: campaign.id,
          shopDomain: campaign.shopDomain,
          mobileAppId: campaign.mobileAppId,
          cursor: null,
        }),
      );
      enqueued += 1;
    } catch (error) {
      await store.releaseClaim(campaign);
      throw error;
    }
  }
  return { claimed: claimed.length, enqueued };
}
