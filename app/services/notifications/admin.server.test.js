import assert from "node:assert/strict";
import test from "node:test";
import { createDraftCampaign, ensureMobileApp } from "./admin.server.js";

const shop = "alpha.myshopify.com";

test("ensureMobileApp creates one row per shop", async () => {
  const state = { app: null };
  const db = {
    mobileApp: {
      async findUnique({ where }) {
        return state.app?.shopDomain === where.shopDomain ? state.app : null;
      },
      async create({ data }) {
        state.app = { id: "app-1", ...data };
        return state.app;
      },
    },
  };

  const first = await ensureMobileApp(db, shop);
  const second = await ensureMobileApp(db, shop);
  assert.equal(first.id, "app-1");
  assert.equal(second.id, first.id);
});

test("createDraftCampaign rejects empty fields", async () => {
  await assert.rejects(
    () =>
      createDraftCampaign(
        { mobileApp: { async findFirst() { return { id: "app-1" }; } } },
        { shopDomain: shop, mobileAppId: "app-1", name: "", title: "t", message: "m" },
      ),
    /campaign_fields_required/,
  );
});
