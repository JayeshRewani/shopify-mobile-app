import assert from "node:assert/strict";
import test from "node:test";
import { createQueueClient } from "./sqs.server.js";
import { enqueueImmediateSend, scheduleCampaign } from "./enqueue.server.js";

const shop = "alpha.myshopify.com";

function createDb(status = "DRAFT") {
  const state = {
    campaign: {
      id: "camp-1",
      shopDomain: shop,
      mobileAppId: "app-1",
      status,
      cancelRequested: false,
      startedAt: null,
    },
    job: null,
  };
  return {
    state,
    notificationCampaign: {
      async findFirst({ where }) {
        const row = state.campaign;
        if (!row || row.id !== where.id || row.shopDomain !== where.shopDomain) return null;
        return { ...row };
      },
      async updateMany({ where, data }) {
        const row = state.campaign;
        if (!row || row.id !== where.id || row.shopDomain !== where.shopDomain) return { count: 0 };
        if (where.status && row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    notificationJob: {
      async upsert({ create }) {
        state.job = { id: "job-1", ...create };
        return state.job;
      },
    },
  };
}

test("production queue client requires an OIDC role", async () => {
  await assert.rejects(
    () => createQueueClient({ AWS_REGION: "ap-south-1" }),
    /AWS_ROLE_ARN/,
  );
});

test("local ElasticMQ does not use AWS keys", async () => {
  const client = await createQueueClient({
    AWS_REGION: "ap-south-1",
    SQS_ENDPOINT: "http://127.0.0.1:9324",
    AWS_ACCESS_KEY_ID: "should-not-be-required",
  });
  assert.equal(typeof client.send, "function");
});

test("immediate send publishes one id-only message and does not repeat", async () => {
  const db = createDb();
  const sent = [];
  const sender = {
    async send(message) {
      sent.push(message);
    },
  };
  const first = await enqueueImmediateSend(db, sender, {
    shopDomain: shop,
    campaignId: "camp-1",
  });
  const second = await enqueueImmediateSend(db, sender, {
    shopDomain: shop,
    campaignId: "camp-1",
  });
  assert.equal(first.enqueued, true);
  assert.equal(second.enqueued, false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, "start");
  assert.equal(sent[0].token, undefined);
  assert.equal(JSON.stringify(sent[0]).includes("private_key"), false);
});

test("a failed publish rolls the campaign back", async () => {
  const db = createDb("SCHEDULED");
  await assert.rejects(
    () =>
      enqueueImmediateSend(db, {
        async send() {
          throw new Error("sqs_down");
        },
      }, { shopDomain: shop, campaignId: "camp-1" }),
    /sqs_down/,
  );
  assert.equal(db.state.campaign.status, "SCHEDULED");
});

test("schedule writes the row and does not call SQS", async () => {
  const db = createDb();
  const when = new Date(Date.now() + 60_000);
  const result = await scheduleCampaign(db, {
    shopDomain: shop,
    campaignId: "camp-1",
    scheduledAt: when,
  });
  assert.equal(result.scheduled, true);
  assert.equal(db.state.campaign.status, "SCHEDULED");
  assert.equal(db.state.job, null);
});

test("another shop cannot enqueue the campaign", async () => {
  const db = createDb();
  const result = await enqueueImmediateSend(db, { async send() {} }, {
    shopDomain: "beta.myshopify.com",
    campaignId: "camp-1",
  });
  assert.equal(result.reason, "not_found");
  assert.equal(db.state.campaign.status, "DRAFT");
});
