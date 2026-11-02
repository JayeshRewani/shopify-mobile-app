import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readOidcHeader, resolveRequestOidcToken, withRequestOidcToken } from "./sqs.server.js";
import { inspectNotificationAwsConfig, inspectOidcClaims, probeProductionAccess } from "./oidc-probe.server.js";

const roleArn = "arn:aws:iam::874287870446:role/mobile-app-notifications-vercel-enqueue-policy";
const queueUrl = "https://sqs.ap-south-1.amazonaws.com/874287870446/mobile-app-notifications-jobs";

function productionEnv(overrides = {}) {
  return {
    AWS_REGION: "ap-south-1",
    AWS_ROLE_ARN: roleArn,
    NOTIFICATIONS_QUEUE_URL: queueUrl,
    ...overrides,
  };
}

function token(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.signature`;
}

function productionToken() {
  return token({
    iss: "https://oidc.vercel.com/acme",
    aud: "https://vercel.com/acme",
    sub: "owner:acme:project:shopify-mobile-app:environment:production",
    exp: Math.floor(Date.now() / 1000) + 600,
  });
}

test("production queue config matches the Mumbai jobs queue", () => {
  const config = inspectNotificationAwsConfig(productionEnv());
  assert.equal(config.ok, true);
  assert.deepEqual(config.problems, []);
  assert.equal(config.queueHost, "sqs.ap-south-1.amazonaws.com");
  assert.equal(config.queueName, "mobile-app-notifications-jobs");
});

test("queue config rejects the DLQ, another region, and static keys", () => {
  const config = inspectNotificationAwsConfig(productionEnv({
    AWS_REGION: "us-east-1",
    NOTIFICATIONS_QUEUE_URL: "https://sqs.ap-south-1.amazonaws.com/874287870446/mobile-app-notifications-jobs-dlq",
    SQS_ENDPOINT: "http://127.0.0.1:9324",
    AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
  }));
  assert.equal(config.ok, false);
  assert.ok(config.problems.includes("aws_region"));
  assert.ok(config.problems.includes("queue_name"));
  assert.ok(config.problems.includes("sqs_endpoint_overrides_aws"));
  assert.ok(config.problems.includes("static_access_keys_present"));
});

test("OIDC claims must be a live production Vercel token", () => {
  const claims = inspectOidcClaims(productionToken());
  assert.equal(claims.ok, true);
  assert.equal(claims.issuerHost, "oidc.vercel.com");
  assert.equal(claims.audienceHost, "vercel.com");

  const preview = inspectOidcClaims(token({
    iss: "https://oidc.vercel.com/acme",
    aud: "https://vercel.com/acme",
    sub: "owner:acme:project:shopify-mobile-app:environment:preview",
    exp: Math.floor(Date.now() / 1000) + 600,
  }));
  assert.equal(preview.ok, false);
  assert.ok(preview.problems.includes("oidc_environment"));
});

test("connection probe assumes the enqueue role and never sends to SQS", async () => {
  const source = readFileSync(new URL("./oidc-probe.server.js", import.meta.url), "utf8");
  assert.equal(source.includes("SendMessage"), false);
  assert.equal(source.includes("notificationCampaign"), false);

  let sent = false;
  const report = await probeProductionAccess(productionEnv(), null, {
    getOidcToken: async () => productionToken(),
    resolveCredentials: async () => {
      sent = true;
      return {
        accessKeyId: "ASIATEMPORARY",
        secretAccessKey: "secret",
        sessionToken: "session",
      };
    },
    getCallerIdentity: async (credentials) => {
      assert.equal(credentials.sessionToken, "session");
      assert.equal(credentials.accessKeyId.startsWith("ASIA"), true);
      return {
        account: "874287870446",
        arn: "arn:aws:sts::874287870446:assumed-role/mobile-app-notifications-vercel-enqueue-policy/session",
      };
    },
  });

  assert.equal(sent, true);
  assert.equal(report.ok, true);
  assert.equal(report.stage, "assumed_role");
  assert.equal(report.temporaryCredentials, true);
  assert.equal(report.queueName, "mobile-app-notifications-jobs");
  assert.equal("accessKeyId" in report, false);
  assert.equal("sessionToken" in report, false);
  assert.equal(JSON.stringify(report).includes("secret"), false);
});

test("connection probe rejects long-lived access keys", async () => {
  const report = await probeProductionAccess(productionEnv(), null, {
    getOidcToken: async () => productionToken(),
    resolveCredentials: async () => ({
      accessKeyId: "AKIASTATIC",
      secretAccessKey: "secret",
    }),
    getCallerIdentity: async () => {
      throw new Error("identity must not run");
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.stage, "credentials");
  assert.equal(report.reason, "not_temporary");
});

test("request OIDC header is visible to the Vercel token reader", async () => {
  const request = new Request("https://example.com/api/notifications/connection", {
    headers: { "x-vercel-oidc-token": "request-token" },
  });
  assert.equal(readOidcHeader(request), "request-token");
  assert.deepEqual(resolveRequestOidcToken(request, {}), {
    token: "request-token",
    source: "request",
  });
  const seen = await withRequestOidcToken(request, () => {
    return globalThis[Symbol.for("@vercel/request-context")].get().headers["x-vercel-oidc-token"];
  });
  assert.equal(seen, "request-token");
  assert.equal(globalThis[Symbol.for("@vercel/request-context")], undefined);
});

test("missing OIDC token fails clearly without CLI refresh", async () => {
  assert.throws(
    () => resolveRequestOidcToken(new Request("https://example.com/api/notifications/connection"), {}),
    /oidc_token_missing/,
  );

  const report = await probeProductionAccess(productionEnv(), new Request("https://example.com/api/notifications/connection"));
  assert.equal(report.ok, false);
  assert.equal(report.stage, "oidc");
  assert.equal(report.tokenPresent, false);
  assert.match(report.error, /oidc_token_missing/);
  assert.equal(report.error.includes("TypeError"), false);
});

test("probe error messages keep the real reason", async () => {
  const report = await probeProductionAccess(productionEnv(), null, {
    getOidcToken: async () => {
      throw new TypeError("project.json not found");
    },
  });
  assert.equal(report.ok, false);
  assert.equal(report.stage, "oidc");
  assert.equal(report.error, "TypeError: project.json not found");
});
