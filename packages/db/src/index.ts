import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/client";

// Reuse a single PrismaClient across hot reloads / serverless invocations
// instead of opening a new database connection pool on every import.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  // Prisma 7 requires an explicit driver adapter instead of reading the
  // connection string from schema.prisma at runtime.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "../generated/client";
