import assert from "node:assert/strict";
import test from "node:test";
import {
  loadFirebaseServiceAccount,
  saveFirebaseServiceAccount,
  toPublicCredential,
} from "./firebase-credentials.server.js";

const shopA = "alpha.myshopify.com";
const shopB = "beta.myshopify.com";

function serviceAccount(projectId = "alpha-project") {
  return {
    type: "service_account",
    project_id: projectId,
    private_key: "-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----\n",
    client_email: "push@alpha-project.iam.gserviceaccount.com",
    extra_secret: "do-not-store",
  };
}

function createDb() {
  const apps = [];
  const credentials = [];
  return {
    apps,
    credentials,
    mobileApp: {
      async findFirst({ where }) {
        return (
          apps.find((app) => app.id === where.id && app.shopDomain === where.shopDomain) ??
          null
        );
      },
    },
    firebaseCredential: {
      async findFirst({ where }) {
        return (
          credentials.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      },
      async upsert({ where, create, update }) {
        const existing = credentials.find((row) => row.mobileAppId === where.mobileAppId);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row = { id: `cred-${credentials.length + 1}`, ...create };
        credentials.push(row);
        return { ...row };
      },
    },
  };
}

test("stores a service account for the owning shop and hides the private key", async () => {
  const db = createDb();
  db.apps.push({ id: "app-a", shopDomain: shopA });

  const saved = await saveFirebaseServiceAccount(db, {
    shopDomain: shopA,
    mobileAppId: "app-a",
    serviceAccount: serviceAccount(),
  });

  assert.deepEqual(saved, {
    shopDomain: shopA,
    mobileAppId: "app-a",
    storage: "DATABASE",
    configured: true,
  });
  assert.equal(JSON.stringify(saved).includes("PRIVATE KEY"), false);
  assert.equal(db.credentials[0].serviceAccountJson.includes("extra_secret"), false);
  assert.equal(db.credentials[0].externalRef, null);
});

test("refuses to save credentials onto another shop's app", async () => {
  const db = createDb();
  db.apps.push({ id: "app-a", shopDomain: shopA });

  await assert.rejects(
    () =>
      saveFirebaseServiceAccount(db, {
        shopDomain: shopB,
        mobileAppId: "app-a",
        serviceAccount: serviceAccount(),
      }),
    /mobile_app_not_found/,
  );
  assert.equal(db.credentials.length, 0);
});

test("loads the private key only for the same shop", async () => {
  const db = createDb();
  db.apps.push({ id: "app-a", shopDomain: shopA });
  await saveFirebaseServiceAccount(db, {
    shopDomain: shopA,
    mobileAppId: "app-a",
    serviceAccount: serviceAccount(),
  });

  const owned = await loadFirebaseServiceAccount(db, {
    shopDomain: shopA,
    mobileAppId: "app-a",
  });
  const otherShop = await loadFirebaseServiceAccount(db, {
    shopDomain: shopB,
    mobileAppId: "app-a",
  });

  assert.equal(owned.project_id, "alpha-project");
  assert.equal(owned.private_key.includes("BEGIN PRIVATE KEY"), true);
  assert.equal(otherShop, null);
});

test("public view never copies the service account json", () => {
  const view = toPublicCredential({
    shopDomain: shopA,
    mobileAppId: "app-a",
    storage: "DATABASE",
    serviceAccountJson: serviceAccount().private_key,
    externalRef: "arn:aws:secretsmanager:secret",
    private_key: "-----BEGIN PRIVATE KEY-----",
  });

  assert.deepEqual(Object.keys(view).sort(), [
    "configured",
    "mobileAppId",
    "shopDomain",
    "storage",
  ]);
  assert.equal(JSON.stringify(view).includes("PRIVATE KEY"), false);
  assert.equal(JSON.stringify(view).includes("secretsmanager"), false);
});
