import assert from "node:assert/strict";
import test from "node:test";
import { loadDoConfig } from "./do-config.js";
import { createDoPoller } from "./do-poll.js";

function doEnv(overrides = {}) {
  return {
    NOTIFICATION_WORKER_ENV: "do",
    AWS_REGION: "ap-south-1",
    NOTIFICATIONS_QUEUE_URL:
      "https://sqs.ap-south-1.amazonaws.com/874287870446/mobile-app-notifications-jobs",
    DATABASE_URL: "postgresql://user:pass@db.example.com:6543/postgres",
    NOTIFICATION_BATCH_SIZE: "500",
    ...overrides,
  };
}

test("DO config requires do env and refuses local ElasticMQ endpoint", () => {
  const config = loadDoConfig(doEnv());
  assert.equal(config.envName, "do");
  assert.equal(config.visibilityTimeout, 180);
  assert.equal(config.waitTimeSeconds, 20);

  assert.throws(() => loadDoConfig(doEnv({ NOTIFICATION_WORKER_ENV: "local" })), /must be "do"/);
  assert.throws(() => loadDoConfig(doEnv({ SQS_ENDPOINT: "http://127.0.0.1:9324" })), /unset/);
});

test("successful and permanent messages are deleted; transient stay for retry", async () => {
  const deleted = [];
  const commands = [];
  const client = {
    async send(command) {
      commands.push(command.constructor.name);
      if (command.constructor.name === "ReceiveMessageCommand") {
        return {
          Messages: [
            {
              MessageId: "ok-1",
              ReceiptHandle: "rh-ok",
              Body: "{\"v\":1}",
            },
            {
              MessageId: "bad-1",
              ReceiptHandle: "rh-bad",
              Body: "{\"v\":1}",
            },
            {
              MessageId: "retry-1",
              ReceiptHandle: "rh-retry",
              Body: "{\"v\":1}",
            },
          ],
        };
      }
      if (command.constructor.name === "DeleteMessageCommand") {
        deleted.push(command.input.ReceiptHandle);
        return {};
      }
      throw new Error(`unexpected ${command.constructor.name}`);
    },
  };

  const poller = createDoPoller(
    {
      region: "ap-south-1",
      queueUrl: "https://sqs.ap-south-1.amazonaws.com/874287870446/mobile-app-notifications-jobs",
      maxMessages: 1,
      waitTimeSeconds: 1,
      visibilityTimeout: 180,
    },
    {
      sqsClient: client,
      async processRecord(record) {
        if (record.messageId === "bad-1") {
          const error = new Error("invalid_message");
          error.permanent = true;
          throw error;
        }
        if (record.messageId === "retry-1") {
          const error = new Error("fcm_transient");
          error.transient = true;
          throw error;
        }
        return { outcome: "ack" };
      },
    },
  );

  const results = await poller.pollOnce();
  assert.equal(results.length, 3);
  assert.deepEqual(deleted, ["rh-ok", "rh-bad"]);
  assert.equal(results[2].status, "retry");
  assert.ok(commands.includes("ReceiveMessageCommand"));
});
