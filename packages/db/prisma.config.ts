import "dotenv/config";
import { defineConfig, env } from "@prisma/config";

// Prisma 7 moved the CLI's connection config (used by `generate`, `migrate`,
// `studio`) out of schema.prisma and into this file. The runtime client's
// connection is configured separately, via a driver adapter in src/index.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
