import { PrismaClient } from "@prisma/client";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createFirebaseSender } from "./firebase-sender.js";
import { parseJobMessage } from "./message.js";
import { processJob, resolveBatchSize } from "./process-job.js";
import { createPrismaStore } from "./prisma-store.js";

let prisma;

function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

function queueSender() {
  const client = new SQSClient({ region: process.env.AWS_REGION || "ap-south-1" });
  const queueUrl = process.env.NOTIFICATIONS_QUEUE_URL;
  return {
    async send(message) {
      await client.send(
        new SendMessageCommand({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(message),
        }),
      );
    },
  };
}

export async function runRecord(record) {
  const message = parseJobMessage(record.body);
  return processJob(message, {
    store: createPrismaStore(getPrisma()),
    sender: createFirebaseSender(),
    batchSize: resolveBatchSize(process.env.NOTIFICATION_BATCH_SIZE),
    enqueue: (next) => queueSender().send(next),
  });
}
