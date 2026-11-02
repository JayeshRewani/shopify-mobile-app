import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { createQueueClient, resolveRequestOidcToken } from "./sqs.server.js";

export const EXPECTED_REGION = "ap-south-1";
export const EXPECTED_ACCOUNT = "874287870446";
export const EXPECTED_QUEUE_NAME = "mobile-app-notifications-jobs";
export const EXPECTED_QUEUE_HOST = "sqs.ap-south-1.amazonaws.com";
// AWS role was created with a -policy suffix; keep the live name.
export const EXPECTED_ROLE_NAME = "mobile-app-notifications-vercel-enqueue-policy";

export function inspectNotificationAwsConfig(env = process.env) {
  const problems = [];
  const region = env.AWS_REGION || "";
  const roleArn = env.AWS_ROLE_ARN || "";
  const roleName = roleArn.split("/").pop() || "";
  let queueHost = null;
  let queueName = null;

  if (region !== EXPECTED_REGION) problems.push("aws_region");
  try {
    const url = new URL(env.NOTIFICATIONS_QUEUE_URL || "");
    queueHost = url.host;
    queueName = url.pathname.split("/").filter(Boolean).pop() || null;
    if (url.protocol !== "https:") problems.push("queue_protocol");
    if (url.host !== EXPECTED_QUEUE_HOST) problems.push("queue_host");
    if (!url.pathname.startsWith(`/${EXPECTED_ACCOUNT}/`)) problems.push("queue_account");
    if (queueName !== EXPECTED_QUEUE_NAME) problems.push("queue_name");
  } catch {
    problems.push("queue_url");
  }
  if (
    roleArn !== `arn:aws:iam::${EXPECTED_ACCOUNT}:role/${EXPECTED_ROLE_NAME}` ||
    roleName !== EXPECTED_ROLE_NAME
  ) {
    problems.push("role_arn");
  }
  if (env.SQS_ENDPOINT) problems.push("sqs_endpoint_overrides_aws");
  if (env.AWS_ACCESS_KEY_ID || env.AWS_SECRET_ACCESS_KEY) problems.push("static_access_keys_present");

  return { ok: problems.length === 0, problems, region, queueHost, queueName, roleName };
}

export function inspectOidcClaims(token) {
  const payload = decodeJwtPayload(token);
  const subject = typeof payload.sub === "string" ? payload.sub : "";
  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  const issuer = typeof payload.iss === "string" ? payload.iss : "";
  const expiresAt = typeof payload.exp === "number" ? payload.exp : null;
  const problems = [];

  if (!issuer.startsWith("https://oidc.vercel.com/")) problems.push("oidc_issuer");
  if (typeof audience !== "string" || !audience.startsWith("https://vercel.com/")) {
    problems.push("oidc_audience");
  }
  if (!subject.includes(":environment:production")) problems.push("oidc_environment");
  if (!expiresAt || expiresAt * 1000 <= Date.now()) problems.push("oidc_expired");

  return {
    ok: problems.length === 0,
    problems,
    issuerHost: hostOf(issuer),
    audience: typeof audience === "string" ? audience : null,
    audienceHost: hostOf(typeof audience === "string" ? audience : ""),
    subject,
    expiresInSec: expiresAt ? expiresAt - Math.floor(Date.now() / 1000) : null,
  };
}

export async function probeProductionAccess(env = process.env, request = null, deps = {}) {
  const config = inspectNotificationAwsConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      stage: "config",
      problems: config.problems,
      region: config.region,
      queueHost: config.queueHost,
      queueName: config.queueName,
      roleName: config.roleName,
    };
  }

  const getToken = deps.getOidcToken || (() => resolveRequestOidcToken(request, env));
  let resolved;
  try {
    resolved = await getToken();
  } catch (error) {
    return {
      ok: false,
      stage: "oidc",
      error: safeError(error),
      tokenPresent: false,
      tokenSource: null,
    };
  }

  const token = typeof resolved === "string" ? resolved : resolved?.token;
  const tokenSource = typeof resolved === "string" ? "injected" : resolved?.source || null;
  if (!token) {
    return {
      ok: false,
      stage: "oidc",
      error: "oidc_token_missing",
      tokenPresent: false,
      tokenSource,
    };
  }

  const claims = inspectOidcClaims(token);
  if (!claims.ok) {
    return {
      ok: false,
      stage: "oidc",
      problems: claims.problems,
      subject: claims.subject,
      audience: claims.audience,
      tokenPresent: true,
      tokenSource,
    };
  }

  const resolveCredentials = deps.resolveCredentials || (async () => {
    const client = await createQueueClient(env, request);
    const credentials = await client.config.credentials();
    return credentials;
  });

  let credentials;
  try {
    credentials = await resolveCredentials();
  } catch (error) {
    return {
      ok: false,
      stage: "assume_role",
      error: safeError(error),
      subject: claims.subject,
      audience: claims.audience,
      issuerHost: claims.issuerHost,
      expectedRoleArn: `arn:aws:iam::${EXPECTED_ACCOUNT}:role/${EXPECTED_ROLE_NAME}`,
      tokenPresent: true,
      tokenSource,
    };
  }

  const temporary = typeof credentials?.accessKeyId === "string" && credentials.accessKeyId.startsWith("ASIA");
  if (!credentials?.sessionToken || !temporary) {
    return {
      ok: false,
      stage: "credentials",
      reason: "not_temporary",
      subject: claims.subject,
      tokenPresent: true,
      tokenSource,
    };
  }

  const identify = deps.getCallerIdentity || (async (assumed) => {
    const sts = new STSClient({ region: EXPECTED_REGION, credentials: assumed });
    const identity = await sts.send(new GetCallerIdentityCommand({}));
    return { account: identity.Account || "", arn: identity.Arn || "" };
  });

  let identity;
  try {
    identity = await identify({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    });
  } catch (error) {
    return {
      ok: false,
      stage: "identity",
      error: safeError(error),
      subject: claims.subject,
      tokenPresent: true,
      tokenSource,
    };
  }

  const assumedRole = typeof identity.arn === "string"
    && identity.arn.includes(`assumed-role/${EXPECTED_ROLE_NAME}/`);
  const accountMatches = identity.account === EXPECTED_ACCOUNT;

  return {
    ok: assumedRole && accountMatches,
    stage: "assumed_role",
    region: config.region,
    queueHost: config.queueHost,
    queueName: config.queueName,
    account: identity.account,
    assumedRoleArn: identity.arn,
    temporaryCredentials: true,
    subject: claims.subject,
    audience: claims.audience,
    expiresInSec: claims.expiresInSec,
    tokenPresent: true,
    tokenSource,
  };
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2 || parts[1] === "") throw new Error("oidc_token_malformed");
  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function hostOf(value) {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

function safeError(error) {
  if (!error) return "unknown_error";
  if (typeof error === "string") return error;
  const name = error.name || "Error";
  const message = error.message || String(error);
  if (!message || message === name) return name;
  return `${name}: ${message}`;
}
