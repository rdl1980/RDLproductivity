import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not required by `prisma generate`, so a fresh install works without a database.
    url: process.env.DATABASE_URL ?? "",
  },
});
