import assert from "node:assert/strict";
import test from "node:test";
import { buildJobMessage, parseJobMessage, PermanentError } from "./message.js";
import { classifyFcmResponse } from "./fcm-result.js";
import { processJob, resolveBatchSize } from "./process-job.js";
import { createSqsHandler } from "./handler.js";
import { promoteDueCampaigns } from "./promote.js";

const shop = "alpha.myshopify.com";
const otherShop = "beta.myshopify.com";

function campaign(overrides = {}) {
  return {
    id: "camp-1",
    shopDomain: shop,
    mobileAppId: "app-1",
    title: "Hello",
    message: "Body",
    imageUrl: null,
    deepLink: "myapp://home",
    audienceType: "ALL",
    platform: null,
    status: "PROCESSING",
    cancelRequested: false,
    ...overrides,
  };
}

function device(id = "dev-1") {
  return {
    id,
    token: `token-${id}`,
    platform: "ANDROID",
    shopDomain: shop,
    mobileAppId: "app-1",
  };
}

function createStore(seed = {}) {
  const state = {
    campaign: seed.campaign === undefined ? campaign() : seed.campaign,
    credential: seed.credential === undefined ? { shopDomain: shop, mobileAppId: "app-1", serviceAccount: { project_id: "p" } } : seed.credential,
    devices: seed.devices ?? [device()],
    more: seed.more ?? false,
    results: [],
    deactivated: [],
    status: null,
    failedReason: null,
  };
  return {
    state,
    async getCampaign(message) {
      const row = state.campaign;
      if (!row) return null;
      if (row.id !== message.campaignId || row.shopDomain !== message.shopDomain || row.mobileAppId !== message.mobileAppId) {
        return null;
      }
      return row;
    },
    async getDatabaseCredential(shopDomain, mobileAppId) {
      const row = state.credential;
      if (!row || row.shopDomain !== shopDomain || row.mobileAppId !== mobileAppId) return null;
      return row;
    },
    async claimDevices(query) {
      assert.equal(query.shopDomain, shop);
      assert.equal(query.mobileAppId, "app-1");
      return state.devices;
    },
    async hasMore() {
      return state.more;
    },
    async recordResults(_campaign, results) {
      state.results.push(...results);
    },
    async deactivateTokens(shopDomain, mobileAppId, ids) {
      state.deactivated.push({ shopDomain, mobileAppId, ids });
    },
    async markCompleted() {
      state.status = "COMPLETED";
    },
    async markFailed(_campaign, reason) {
      state.status = "FAILED";
      state.failedReason = reason;
    },
    async markCancelled() {
      state.status = "CANCELLED";
    },
  };
}

function message(overrides = {}) {
  return buildJobMessage({
    action: "start",
    jobId: "job-1",
    campaignId: "camp-1",
    shopDomain: shop,
    mobileAppId: "app-1",
    ...overrides,
  });
}

test("job messages carry ids only", () => {
  const body = buildJobMessage({
    action: "test",
    jobId: "job-1",
    campaignId: "camp-1",
    shopDomain: shop,
    mobileAppId: "app-1",
    deviceTokenId: "dev-1",
    token: "should-not-copy",
    serviceAccount: { private_key: "secret" },
  });
  assert.equal(body.deviceTokenId, "dev-1");
  assert.equal(body.token, undefined);
  assert.equal(JSON.stringify(body).includes("private_key"), false);
  assert.deepEqual(parseJobMessage(JSON.stringify(body)), body);
});

test("rejects a shop mismatch before sending", async () => {
  const store = createStore();
  let sent = false;
  const result = await processJob(message({ shopDomain: otherShop }), {
    store,
    batchSize: 100,
    sender: { async sendEach() { sent = true; return []; } },
    enqueue: async () => {},
  });
  assert.equal(result.reason, "tenant_mismatch");
  assert.equal(sent, false);
});

test("missing credentials fail the campaign without calling FCM", async () => {
  const store = createStore({ credential: null });
  let sent = false;
  const result = await processJob(message(), {
    store,
    batchSize: 100,
    sender: { async sendEach() { sent = true; return []; } },
    enqueue: async () => {},
  });
  assert.equal(result.reason, "firebase_credentials_missing");
  assert.equal(store.state.status, "FAILED");
  assert.equal(sent, false);
});

test("records provider acceptance separately and deactivates invalid tokens", async () => {
  const store = createStore({ devices: [device("dev-1"), device("dev-2")] });
  const result = await processJob(message(), {
    store,
    batchSize: 100,
    enqueue: async () => {},
    sender: {
      async sendEach() {
        return [
          classifyFcmResponse({ success: true, messageId: "projects/p/messages/1" }, device("dev-1")),
          classifyFcmResponse(
            { success: false, error: { code: "messaging/registration-token-not-registered", message: "gone" } },
            device("dev-2"),
          ),
        ];
      },
    },
  });
  assert.equal(result.reason, "completed");
  assert.equal(store.state.results[0].status, "ACCEPTED");
  assert.equal(store.state.results[1].status, "INVALID_TOKEN");
  assert.deepEqual(store.state.deactivated, [
    { shopDomain: shop, mobileAppId: "app-1", ids: ["dev-2"] },
  ]);
  assert.equal(store.state.status, "COMPLETED");
});

test("retries when every provider response is transient", async () => {
  const store = createStore();
  await assert.rejects(
    () =>
      processJob(message(), {
        store,
        batchSize: 100,
        enqueue: async () => {},
        sender: {
          async sendEach() {
            return [
              classifyFcmResponse(
                { success: false, error: { code: "messaging/quota-exceeded", message: "slow down" } },
                device(),
              ),
            ];
          },
        },
      }),
    /fcm_transient/,
  );
  assert.equal(store.state.results[0].status, "FAILED");
  assert.equal(store.state.status, null);
});

test("enqueues the next page without device tokens", async () => {
  const store = createStore({ more: true });
  const queued = [];
  await processJob(message(), {
    store,
    batchSize: 1,
    sender: {
      async sendEach() {
        return [classifyFcmResponse({ success: true, messageId: "m1" }, device())];
      },
    },
    enqueue: async (next) => queued.push(next),
  });
  assert.equal(queued[0].action, "continue");
  assert.equal(queued[0].cursor, "dev-1");
  assert.equal(queued[0].token, undefined);
  assert.equal(store.state.status, null);
});

test("cancellation is acknowledged and not sent", async () => {
  const store = createStore({ campaign: campaign({ cancelRequested: true }) });
  let sent = false;
  const result = await processJob(message(), {
    store,
    batchSize: 10,
    sender: { async sendEach() { sent = true; return []; } },
    enqueue: async () => {},
  });
  assert.equal(result.reason, "cancelled");
  assert.equal(store.state.status, "CANCELLED");
  assert.equal(sent, false);
});

test("permanent SQS failures are acked and transient ones are returned", async () => {
  const handler = createSqsHandler({
    processRecord: async (record) => {
      if (record.messageId === "bad") throw new PermanentError("invalid_json");
      const error = new Error("throttle");
      error.transient = true;
      throw error;
    },
  });
  const response = await handler({
    Records: [{ messageId: "bad", body: "{}" }, { messageId: "later", body: "{}" }],
  });
  assert.deepEqual(response.batchItemFailures, [{ itemIdentifier: "later" }]);
});

test("a failed enqueue releases the scheduled claim", async () => {
  const released = [];
  await assert.rejects(
    () =>
      promoteDueCampaigns({
        store: {
          async claimDueScheduled() {
            return [{ id: "camp-1", jobId: "job-1", shopDomain: shop, mobileAppId: "app-1" }];
          },
          async releaseClaim(campaign) {
            released.push(campaign.id);
          },
        },
        enqueue: async () => {
          throw new Error("sqs_down");
        },
      }),
    /sqs_down/,
  );
  assert.deepEqual(released, ["camp-1"]);
});

test("rejects a batch size above the FCM limit", () => {
  assert.throws(() => resolveBatchSize(501), /NOTIFICATION_BATCH_SIZE/);
});
