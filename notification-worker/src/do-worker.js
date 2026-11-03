import { loadDoConfig } from "./do-config.js";
import { createDoPoller } from "./do-poll.js";

async function main() {
  const config = loadDoConfig(process.env);
  const { runRecord } = await import("./runtime.js");
  const { runPromote } = await import("./promote-runtime.js");

  const poller = createDoPoller(config, {
    processRecord: (record) => runRecord(record),
  });

  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ event: "shutdown", signal }));
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  console.log(
    JSON.stringify({
      event: "do_worker_start",
      region: config.region,
      queueHost: new URL(config.queueUrl).host,
      promoteIntervalMs: config.promoteIntervalMs,
    }),
  );

  let lastPromoteAt = 0;

  while (!stopping) {
    const now = Date.now();
    if (now - lastPromoteAt >= config.promoteIntervalMs) {
      try {
        const promote = await runPromote(new Date(now));
        console.log(JSON.stringify({ event: "promote", promote }));
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "promote_error",
            error: error?.message || "promote_failed",
          }),
        );
      }
      lastPromoteAt = now;
    }

    try {
      const results = await poller.pollOnce();
      if (results.length > 0) {
        console.log(JSON.stringify({ event: "poll", results }));
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "poll_error",
          error: error?.message || "poll_failed",
        }),
      );
      await sleep(2000);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(JSON.stringify({ event: "fatal", error: error?.message || String(error) }));
  process.exit(1);
});
