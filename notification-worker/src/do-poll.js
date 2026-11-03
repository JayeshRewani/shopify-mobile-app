import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

export function createDoPoller(config, deps = {}) {
  const client =
    deps.sqsClient ||
    new SQSClient({
      region: config.region,
    });
  const processRecord = deps.processRecord;
  if (typeof processRecord !== "function") {
    throw new Error("processRecord is required.");
  }

  return {
    async pollOnce() {
      const response = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: config.queueUrl,
          MaxNumberOfMessages: config.maxMessages,
          WaitTimeSeconds: config.waitTimeSeconds,
          VisibilityTimeout: config.visibilityTimeout,
        }),
      );

      const messages = response.Messages || [];
      const results = [];
      for (const message of messages) {
        const record = {
          messageId: message.MessageId,
          receiptHandle: message.ReceiptHandle,
          body: message.Body,
        };
        try {
          const outcome = await processRecord(record);
          await client.send(
            new DeleteMessageCommand({
              QueueUrl: config.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
          results.push({ messageId: message.MessageId, status: "acked", outcome });
        } catch (error) {
          if (error?.permanent) {
            await client.send(
              new DeleteMessageCommand({
                QueueUrl: config.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
            results.push({
              messageId: message.MessageId,
              status: "permanent",
              error: error.message,
            });
            continue;
          }
          results.push({
            messageId: message.MessageId,
            status: "retry",
            error: error?.message || "retry",
          });
        }
      }
      return results;
    },
  };
}
