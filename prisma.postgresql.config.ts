import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: "prisma/postgresql/schema.prisma",
  migrations: {
    path: "prisma/postgresql/migrations",
  },
});
