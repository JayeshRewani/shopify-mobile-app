const FCM_MAX_BATCH = 500;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function loadLocalConfig(env = process.env) {
  const batchSize = parseBatchSize(env.NOTIFICATION_BATCH_SIZE);
  const databaseUrl = readDatabaseUrl(env);
  const queueEndpoint = required(env, "SQS_ENDPOINT");
  const region = required(env, "AWS_REGION");
  const queueName = required(env, "SQS_QUEUE_NAME");
  const secretSource = env.FIREBASE_SECRET_SOURCE || "file";

  if (secretSource !== "file") {
    throw new Error(
      "Local setup reads Firebase credentials from a file. Database credentials are loaded by the backend service.",
    );
  }

  return {
    envName: "local",
    batchSize,
    databaseUrl,
    queueEndpoint,
    region,
    queueName,
    secretSource,
    serviceAccountPath: required(env, "FIREBASE_SERVICE_ACCOUNT_PATH"),
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

function readDatabaseUrl(env) {
  const databaseUrl = required(env, "DATABASE_URL");
  let host = "";
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error("DATABASE_URL must be a Postgres URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      "Refusing a non-local DATABASE_URL. Local setup does not connect to the production database.",
    );
  }
  return databaseUrl;
}

function required(env, name) {
  const value = env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}
