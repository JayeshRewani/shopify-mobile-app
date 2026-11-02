export const JOB_MESSAGE_VERSION = 1;
const ACTIONS = new Set(["start", "continue", "test"]);

export function buildJobMessage(input) {
  const action = input?.action;
  if (!ACTIONS.has(action)) {
    throw new Error("invalid_action");
  }
  for (const field of ["jobId", "campaignId", "shopDomain", "mobileAppId"]) {
    if (typeof input[field] !== "string" || input[field].trim() === "") {
      throw new Error("invalid_message");
    }
  }
  const message = {
    v: JOB_MESSAGE_VERSION,
    action,
    jobId: input.jobId.trim(),
    campaignId: input.campaignId.trim(),
    shopDomain: input.shopDomain.trim(),
    mobileAppId: input.mobileAppId.trim(),
    cursor: typeof input.cursor === "string" && input.cursor.trim() !== "" ? input.cursor.trim() : null,
  };
  if (action === "test") {
    if (typeof input.deviceTokenId !== "string" || input.deviceTokenId.trim() === "") {
      throw new Error("invalid_message");
    }
    message.deviceTokenId = input.deviceTokenId.trim();
  }
  return message;
}
