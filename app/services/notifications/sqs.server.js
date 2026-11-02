import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { fromWebToken } from "@aws-sdk/credential-provider-web-identity";
import { buildJobMessage } from "./job-message.js";

export { buildJobMessage };

const OIDC_CONTEXT = Symbol.for("@vercel/request-context");

export function readOidcHeader(request) {
  const value = request?.headers?.get?.("x-vercel-oidc-token");
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readOidcContextToken() {
  const headers = globalThis[OIDC_CONTEXT]?.get?.()?.headers;
  const value = headers?.["x-vercel-oidc-token"];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function resolveRequestOidcToken(request = null, env = process.env) {
  const fromRequest = readOidcHeader(request);
  if (fromRequest) return { token: fromRequest, source: "request" };

  const fromContext = readOidcContextToken();
  if (fromContext) return { token: fromContext, source: "context" };

  const fromEnv = typeof env.VERCEL_OIDC_TOKEN === "string" ? env.VERCEL_OIDC_TOKEN.trim() : "";
  if (fromEnv) return { token: fromEnv, source: "env" };

  throw new Error(
    "oidc_token_missing: Vercel did not provide x-vercel-oidc-token on this request.",
  );
}

export async function withRequestOidcToken(request, fn) {
  const token = readOidcHeader(request);
  if (!token) return fn();
  const previous = globalThis[OIDC_CONTEXT];
  globalThis[OIDC_CONTEXT] = {
    get: () => ({ headers: { "x-vercel-oidc-token": token } }),
  };
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis[OIDC_CONTEXT];
    else globalThis[OIDC_CONTEXT] = previous;
  }
}

export async function createQueueClient(env = process.env, request = null) {
  const region = env.AWS_REGION || "ap-south-1";
  if (env.SQS_ENDPOINT) {
    return new SQSClient({
      region,
      endpoint: env.SQS_ENDPOINT,
      credentials: {
        accessKeyId: "local",
        secretAccessKey: "local",
      },
    });
  }
  if (!env.AWS_ROLE_ARN) {
    throw new Error("AWS_ROLE_ARN is required when SQS_ENDPOINT is not set.");
  }

  const { token } = resolveRequestOidcToken(request, env);
  return new SQSClient({
    region,
    credentials: fromWebToken({
      roleArn: env.AWS_ROLE_ARN,
      webIdentityToken: token,
      clientConfig: { region },
    }),
  });
}

export function createMessageSender(client, queueUrl) {
  return {
    async send(message) {
      const body = buildJobMessage(message);
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(body),
        }),
      );
      return body;
    },
  };
}
