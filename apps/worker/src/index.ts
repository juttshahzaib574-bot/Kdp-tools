import { prisma } from "@kdp/db";
import { claimNextJob } from "./claim-job";
import { processJob } from "./process-job";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 5_000;
const IDLE_POLL_INTERVAL_MS = 15_000;

let shuttingDown = false;

async function tick(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  // processJob() already catches and records its own failures; this catch
  // is a last-resort backstop so a bug inside error handling itself still
  // can't crash the poll loop.
  try {
    await processJob(job);
  } catch (error) {
    logger.error("unexpected error processing job", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return true;
}

async function mainLoop() {
  logger.info("worker started");

  while (!shuttingDown) {
    let didWork = false;
    try {
      didWork = await tick();
    } catch (error) {
      logger.error("error claiming job", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await sleep(didWork ? POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS);
  }

  logger.info("worker stopped");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string) {
  logger.info("shutting down", { signal });
  shuttingDown = true;
  await prisma.$disconnect();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Never let one bad job or a transient rejection anywhere in the process
// take the whole worker down — log it and keep the poll loop alive.
process.on("unhandledRejection", (reason) => {
  logger.error("unhandled rejection", { reason: String(reason) });
});
process.on("uncaughtException", (error) => {
  logger.error("uncaught exception", { error: error.message, stack: error.stack });
});

void mainLoop();
