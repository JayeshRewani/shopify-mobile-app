import assert from "node:assert/strict";
import test from "node:test";
import { loadLocalConfig } from "./config.js";

const localEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/notifications_dev",
  SQS_ENDPOINT: "http://localhost:9324",
  SQS_QUEUE_NAME: "notifications-jobs",
  AWS_REGION: "ap-southeast-1",
  FIREBASE_SECRET_SOURCE: "file",
  FIREBASE_SERVICE_ACCOUNT_PATH: "./.secrets/firebase-test.json",
};

test("defaults the batch size to the FCM maximum", () => {
  const config = loadLocalConfig(localEnv);
  assert.equal(config.batchSize, 500);
});

test("accepts a configured batch size", () => {
  const config = loadLocalConfig({ ...localEnv, NOTIFICATION_BATCH_SIZE: "100" });
  assert.equal(config.batchSize, 100);
});

test("rejects a batch larger than one FCM request", () => {
  assert.throws(
    () => loadLocalConfig({ ...localEnv, NOTIFICATION_BATCH_SIZE: "501" }),
    /NOTIFICATION_BATCH_SIZE/,
  );
});

test("refuses the production database", () => {
  assert.throws(
    () =>
      loadLocalConfig({
        ...localEnv,
        DATABASE_URL:
          "postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
      }),
    /non-local DATABASE_URL/,
  );
});

test("refuses Secrets Manager in the local process", () => {
  assert.throws(
    () => loadLocalConfig({ ...localEnv, FIREBASE_SECRET_SOURCE: "secrets-manager" }),
    /Local setup reads Firebase credentials from a file/,
  );
});
