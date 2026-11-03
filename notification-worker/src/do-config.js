const FCM_MAX_BATCH = 500;

export function loadDoConfig(env = process.env) {
  const envName = (env.NOTIFICATION_WORKER_ENV || "").trim().toLowerCase();
  if (envName !== "do") {
    throw new Error('NOTIFICATION_WORKER_ENV must be "do" for the DigitalOcean worker.');
  }

  const databaseUrl = required(env, "DATABASE_URL");
  assertPostgresUrl(databaseUrl);

  if (env.SQS_ENDPOINT) {
    throw new Error("SQS_ENDPOINT must be unset on DigitalOcean. Use real AWS SQS.");
  }

  return {
    envName: "do",
    databaseUrl,
    region: required(env, "AWS_REGION") || "ap-south-1",
    queueUrl: required(env, "NOTIFICATIONS_QUEUE_URL"),
    batchSize: parseBatchSize(env.NOTIFICATION_BATCH_SIZE),
    promoteIntervalMs: parsePositiveInt(env.PROMOTE_INTERVAL_MS, 60_000),
    waitTimeSeconds: parsePositiveInt(env.SQS_WAIT_TIME_SECONDS, 20),
    visibilityTimeout: parsePositiveInt(env.SQS_VISIBILITY_TIMEOUT, 180),
    maxMessages: 1,
  };
}

function parseBatchSize(value) {
  const raw = value === undefined || value === "" ? String(FCM_MAX_BATCH) : value;
  const batchSize = Number(raw);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > FCM_MAX_BATCH) {
    throw new Error(
      `NOTIFICATION_BATCH_SIZE must be an integer from 1 to ${FCM_MAX_BATCH}.`,
    );
  }
  return batchSize;
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Interval and SQS timing values must be positive integers.");
  }
  return parsed;
}

function assertPostgresUrl(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol)) {
      throw new Error("bad protocol");
    }
  } catch {
    throw new Error("DATABASE_URL must be a Postgres URL.");
  }
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}
