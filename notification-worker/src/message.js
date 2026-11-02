export const JOB_MESSAGE_VERSION = 1;
const ACTIONS = new Set(["start", "continue", "test"]);

export class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = "PermanentError";
    this.permanent = true;
  }
}

export class TransientError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransientError";
    this.transient = true;
  }
}

export function buildJobMessage(input) {
  const action = input?.action;
  if (!ACTIONS.has(action)) {
    throw new PermanentError("invalid_action");
  }
  for (const field of ["jobId", "campaignId", "shopDomain", "mobileAppId"]) {
    if (typeof input[field] !== "string" || input[field].trim() === "") {
      throw new PermanentError("invalid_message");
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
      throw new PermanentError("invalid_message");
    }
    message.deviceTokenId = input.deviceTokenId.trim();
  }
  return message;
}

export function parseJobMessage(body) {
  let value = body;
  if (typeof body === "string") {
    try {
      value = JSON.parse(body);
    } catch {
      throw new PermanentError("invalid_json");
    }
  }
  if (!value || typeof value !== "object" || value.v !== JOB_MESSAGE_VERSION) {
    throw new PermanentError("unsupported_message");
  }
  return buildJobMessage(value);
}
