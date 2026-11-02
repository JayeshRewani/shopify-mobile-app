import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalPostgresUrl } from "./local-database-guard.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LOCAL_URL =
  "postgresql://postgres:postgres@127.0.0.1:54329/notifications_dev";

const localUrl = assertLocalPostgresUrl(
  process.env.LOCAL_DATABASE_URL || DEFAULT_LOCAL_URL,
);
const parsed = new URL(localUrl);
console.log(
  `Local database host ${parsed.hostname}:${parsed.port || "5432"} database ${parsed.pathname.slice(1)}`,
);

const env = {
  ...process.env,
  DATABASE_URL: localUrl,
  DIRECT_URL: localUrl,
};

// Notification SQL now lives under prisma/migrations, so deploy applies it.
run("migrate", ["prisma", "migrate", "deploy"]);

function run(label, args) {
  const result = spawnSync("npx", args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log(`Completed ${label}`);
}
