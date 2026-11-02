import { PrismaClient } from "@prisma/client";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { promoteDueCampaigns } from "./promote.js";
import { createPrismaStore } from "./prisma-store.js";

let prisma;

function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

export async function runPromote(now = new Date()) {
  const client = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
  const queueUrl = process.env.NOTIFICATIONS_QUEUE_URL;
  return promoteDueCampaigns({
    store: createPrismaStore(getPrisma()),
    now,
    enqueue: async (message) => {
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );
    },
  });
}
