import { TransientError } from "./message.js";

const FCM_MAX_BATCH = 500;

export function resolveBatchSize(value) {
  const parsed = Number(value === undefined || value === "" ? FCM_MAX_BATCH : value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > FCM_MAX_BATCH) {
    throw new Error(`NOTIFICATION_BATCH_SIZE must be an integer from 1 to ${FCM_MAX_BATCH}.`);
  }
  return parsed;
}

export async function processJob(message, deps) {
  const batchSize = resolveBatchSize(deps.batchSize);
  const campaign = await deps.store.getCampaign(message);
  if (
    !campaign ||
    campaign.shopDomain !== message.shopDomain ||
    campaign.mobileAppId !== message.mobileAppId ||
    campaign.id !== message.campaignId
  ) {
    return { outcome: "ack", reason: "tenant_mismatch" };
  }

  if (campaign.cancelRequested || campaign.status === "CANCELLED") {
    await deps.store.markCancelled(campaign);
    return { outcome: "ack", reason: "cancelled" };
  }

  if (message.action !== "test" && campaign.status !== "PROCESSING") {
    return { outcome: "ack", reason: "not_processing" };
  }

  if (campaign.audienceType === "SEGMENT") {
    await deps.store.markFailed(campaign, "segment_not_supported");
    return { outcome: "ack", reason: "segment_not_supported" };
  }

  const credential = await deps.store.getDatabaseCredential(
    message.shopDomain,
    message.mobileAppId,
  );
  if (!credential?.serviceAccount) {
    await deps.store.markFailed(campaign, "firebase_credentials_missing");
    return { outcome: "ack", reason: "firebase_credentials_missing" };
  }
  if (credential.shopDomain !== message.shopDomain || credential.mobileAppId !== message.mobileAppId) {
    return { outcome: "ack", reason: "tenant_mismatch" };
  }

  const devices = await deps.store.claimDevices({
    shopDomain: message.shopDomain,
    mobileAppId: message.mobileAppId,
    campaignId: campaign.id,
    audienceType: campaign.audienceType,
    platform: campaign.platform,
    cursor: message.cursor,
    deviceTokenId: message.action === "test" ? message.deviceTokenId : null,
    limit: message.action === "test" ? 1 : batchSize,
  });

  if (devices.length === 0) {
    if (message.action !== "test") {
      await deps.store.markCompleted(campaign);
    }
    return { outcome: "ack", reason: "empty_audience" };
  }

  const mismatched = devices.filter(
    (device) =>
      device.shopDomain !== message.shopDomain || device.mobileAppId !== message.mobileAppId,
  );
  if (mismatched.length > 0) {
    return { outcome: "ack", reason: "tenant_mismatch" };
  }

  let results;
  try {
    results = await deps.sender.sendEach({
      serviceAccount: credential.serviceAccount,
      campaign,
      devices,
    });
  } catch (error) {
    if (error?.transient) throw error;
    throw new TransientError(error?.message || "fcm_send_failed");
  }

  await deps.store.recordResults(campaign, results);
  const invalidIds = results
    .filter((result) => result.status === "INVALID_TOKEN")
    .map((result) => result.deviceTokenId);
  if (invalidIds.length > 0) {
    await deps.store.deactivateTokens(message.shopDomain, message.mobileAppId, invalidIds);
  }

  if (results.length > 0 && results.every((result) => result.transient)) {
    throw new TransientError("fcm_transient");
  }

  if (message.action === "test") {
    return { outcome: "ack", reason: "test_sent" };
  }

  const cursor = devices[devices.length - 1].id;
  const more = await deps.store.hasMore({
    shopDomain: message.shopDomain,
    mobileAppId: message.mobileAppId,
    campaignId: campaign.id,
    audienceType: campaign.audienceType,
    platform: campaign.platform,
    cursor,
  });
  if (more) {
    await deps.enqueue({
      v: message.v,
      action: "continue",
      jobId: message.jobId,
      campaignId: message.campaignId,
      shopDomain: message.shopDomain,
      mobileAppId: message.mobileAppId,
      cursor,
    });
    return { outcome: "ack", reason: "continued" };
  }

  await deps.store.markCompleted(campaign);
  return { outcome: "ack", reason: "completed" };
}
