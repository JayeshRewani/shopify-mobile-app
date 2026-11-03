import assert from "node:assert/strict";
import test from "node:test";
import {
  hashRegistrationKey,
  issueRegistrationKey,
  registerDeviceToken,
  registrationKeysMatch,
  unregisterDeviceToken,
} from "./device-tokens.server.js";

const shop = "alpha.myshopify.com";

function createDb(overrides = {}) {
  const state = {
    app: {
      id: "app-1",
      shopDomain: shop,
      registrationKeyHash: hashRegistrationKey("reg_test_key"),
    },
    tokens: [],
    ...overrides,
  };
  return {
    state,
    mobileApp: {
      async findUnique({ where }) {
        return state.app?.shopDomain === where.shopDomain ? state.app : null;
      },
    },
    deviceToken: {
      async findFirst({ where }) {
        return (
          state.tokens.find(
            (row) =>
              row.mobileAppId === where.mobileAppId &&
              row.shopDomain === where.shopDomain &&
              row.token === where.token &&
              row.isActive === where.isActive,
          ) || null
        );
      },
      async create({ data }) {
        const row = { id: `dev-${state.tokens.length + 1}`, ...data };
        state.tokens.push(row);
        return row;
      },
      async update({ where, data }) {
        const row = state.tokens.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
      async updateMany({ where, data }) {
        let count = 0;
        for (const row of state.tokens) {
          if (
            row.shopDomain === where.shopDomain &&
            row.mobileAppId === where.mobileAppId &&
            row.token === where.token &&
            row.isActive === where.isActive
          ) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
  };
}

test("registration key hashing is stable and timing-safe compared", () => {
  const issued = issueRegistrationKey();
  assert.equal(issued.key.startsWith("reg_"), true);
  assert.equal(registrationKeysMatch(issued.hash, issued.key), true);
  assert.equal(registrationKeysMatch(issued.hash, "wrong"), false);
});

test("register creates a device and refreshes an active duplicate token", async () => {
  const db = createDb();
  const first = await registerDeviceToken(db, {
    shopDomain: shop,
    registrationKey: "reg_test_key",
    token: "fcm-token-1",
    platform: "ANDROID",
  });
  assert.equal(first.platform, "ANDROID");
  assert.equal(first.isActive, true);
  assert.equal("token" in first, false);

  const second = await registerDeviceToken(db, {
    shopDomain: shop,
    registrationKey: "reg_test_key",
    token: "fcm-token-1",
    platform: "ANDROID",
  });
  assert.equal(second.id, first.id);
  assert.equal(db.state.tokens.length, 1);
});

test("register rejects storefront-only auth without registration key", async () => {
  const db = createDb();
  await assert.rejects(
    () =>
      registerDeviceToken(db, {
        shopDomain: shop,
        token: "fcm-token-1",
        platform: "IOS",
      }),
    /registration_key_required/,
  );
});

test("unregister deactivates the active token", async () => {
  const db = createDb();
  await registerDeviceToken(db, {
    shopDomain: shop,
    registrationKey: "reg_test_key",
    token: "fcm-token-2",
    platform: "IOS",
  });
  const result = await unregisterDeviceToken(db, {
    shopDomain: shop,
    registrationKey: "reg_test_key",
    token: "fcm-token-2",
  });
  assert.equal(result.unregistered, true);
  assert.equal(db.state.tokens[0].isActive, false);
});
