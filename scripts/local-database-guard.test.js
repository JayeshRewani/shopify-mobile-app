import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertLocalPostgresUrl } from "./local-database-guard.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("accepts a local Postgres URL", () => {
  assert.equal(
    assertLocalPostgresUrl(
      "postgresql://postgres:postgres@127.0.0.1:54329/notifications_dev",
    ),
    "postgresql://postgres:postgres@127.0.0.1:54329/notifications_dev",
  );
});

test("refuses Supabase and any non-local host", () => {
  assert.throws(
    () =>
      assertLocalPostgresUrl(
        "postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
      ),
    /non-local/,
  );
  assert.throws(
    () => assertLocalPostgresUrl("postgresql://postgres:postgres@db.internal:5432/app"),
    /non-local/,
  );
});

test("notification SQL is in prisma/migrations for production deploy", () => {
  const migrations = join(root, "prisma", "migrations");
  const sql = listSql(migrations).map((file) => readFileSync(file, "utf8")).join("\n");
  assert.equal(sql.includes('CREATE TABLE "mobile_apps"'), true);
  assert.equal(sql.includes("device_tokens_active_token_key"), true);
  assert.equal(sql.includes('CREATE TABLE "notification_campaigns"'), true);
  assert.equal(sql.includes('CREATE TABLE "firebase_credentials"'), true);
  assert.equal(sql.includes("service_account_json"), true);

  const folders = readdirSync(migrations).filter((name) =>
    statSync(join(migrations, name)).isDirectory(),
  );
  assert.ok(folders.includes("20261031120000_push_notifications"));
  assert.ok(folders.includes("20261031163000_firebase_credentials"));
});

function listSql(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSql(path));
    } else if (entry.endsWith(".sql")) {
      files.push(path);
    }
  }
  return files;
}
