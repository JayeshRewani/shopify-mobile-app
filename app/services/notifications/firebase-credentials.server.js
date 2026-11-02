import { normalizeShopDomain } from "../mobile-http.server.js";

const ALLOWED_FIELDS = [
  "type",
  "project_id",
  "private_key_id",
  "private_key",
  "client_email",
  "client_id",
  "auth_uri",
  "token_uri",
  "auth_provider_x509_cert_url",
  "client_x509_cert_url",
  "universe_domain",
];

const MAX_JSON_LENGTH = 20_000;

export function toPublicCredential(row) {
  if (!row) return null;
  return {
    shopDomain: row.shopDomain,
    mobileAppId: row.mobileAppId,
    storage: row.storage,
    configured:
      row.storage === "DATABASE"
        ? Boolean(row.serviceAccountJson)
        : Boolean(row.externalRef),
  };
}

export async function saveFirebaseServiceAccount(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const mobileAppId = requireId(input.mobileAppId, "mobileAppId");
  const serviceAccountJson = serializeServiceAccount(input.serviceAccount);

  const app = await db.mobileApp.findFirst({
    where: { id: mobileAppId, shopDomain },
    select: { id: true, shopDomain: true },
  });
  if (!app) {
    throw credentialError("mobile_app_not_found", 404);
  }

  const saved = await db.firebaseCredential.upsert({
    where: { mobileAppId },
    create: {
      shopDomain,
      mobileAppId,
      storage: "DATABASE",
      serviceAccountJson,
      externalRef: null,
    },
    update: {
      shopDomain,
      storage: "DATABASE",
      serviceAccountJson,
      externalRef: null,
    },
  });

  return toPublicCredential(saved);
}

// Server-side loader for the worker. Callers must not place the return
// value on an HTTP response.
export async function loadFirebaseServiceAccount(db, input) {
  const shopDomain = requireShop(input.shopDomain);
  const mobileAppId = requireId(input.mobileAppId, "mobileAppId");
  const row = await db.firebaseCredential.findFirst({
    where: { shopDomain, mobileAppId, storage: "DATABASE" },
    select: { shopDomain: true, serviceAccountJson: true },
  });
  if (!row?.serviceAccountJson || row.shopDomain !== shopDomain) return null;
  return JSON.parse(row.serviceAccountJson);
}

function serializeServiceAccount(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw credentialError("invalid_service_account", 400);
  }
  if (value.type !== "service_account") {
    throw credentialError("invalid_service_account", 400);
  }
  for (const field of ["project_id", "private_key", "client_email"]) {
    if (typeof value[field] !== "string" || value[field].trim() === "") {
      throw credentialError("invalid_service_account", 400);
    }
  }
  if (!value.private_key.includes("BEGIN PRIVATE KEY")) {
    throw credentialError("invalid_service_account", 400);
  }

  const stored = {};
  for (const field of ALLOWED_FIELDS) {
    if (value[field] === undefined) continue;
    if (typeof value[field] !== "string") {
      throw credentialError("invalid_service_account", 400);
    }
    stored[field] = value[field];
  }
  const json = JSON.stringify(stored);
  if (json.length > MAX_JSON_LENGTH) {
    throw credentialError("invalid_service_account", 400);
  }
  return json;
}

function requireShop(value) {
  const shopDomain = normalizeShopDomain(value);
  if (!shopDomain) throw credentialError("invalid_shop", 400);
  return shopDomain;
}

function requireId(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw credentialError(`invalid_${field}`, 400);
  }
  return value.trim();
}

function credentialError(code, status) {
  const error = new Error(code);
  error.status = status;
  return error;
}
