import { prisma } from "@kdp/db";
export const MAX_JOB_ATTEMPTS = 3;
/**
 * Atomically claims the oldest queued job using `FOR UPDATE SKIP LOCKED` so
 * multiple worker processes/instances can run concurrently without ever
 * picking up the same job twice — this is what lets us scale worker
 * capacity horizontally later without a separate distributed lock service.
 */
export async function claimNextJob() {
    return prisma.$transaction(async (tx) => {
        const [job] = await tx.$queryRaw `
      SELECT * FROM "GenerationJob"
      WHERE status = 'QUEUED'
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
        if (!job)
            return null;
        return tx.generationJob.update({
            where: { id: job.id },
            data: {
                status: "RUNNING",
                startedAt: new Date(),
                attempts: { increment: 1 },
            },
        });
    });
}
