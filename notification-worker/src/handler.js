export function createSqsHandler({ processRecord }) {
  return async function handler(event) {
    const failures = [];
    for (const record of event?.Records ?? []) {
      try {
        await processRecord(record);
      } catch (error) {
        if (error?.permanent) {
          console.error(
            JSON.stringify({
              messageId: record.messageId,
              permanent: true,
              error: error.message,
            }),
          );
          continue;
        }
        console.error(
          JSON.stringify({
            messageId: record.messageId,
            retry: true,
            error: error?.message || "retry",
          }),
        );
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  };
}

async function processRecord(record) {
  const { runRecord } = await import("./runtime.js");
  return runRecord(record);
}

export const handler = createSqsHandler({ processRecord });
