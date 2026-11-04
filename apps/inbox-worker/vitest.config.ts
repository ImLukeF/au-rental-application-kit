import { randomBytes } from "node:crypto";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  root: process.cwd(),
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: new URL("./wrangler.jsonc", import.meta.url).pathname,
        environment: "development",
      },
      miniflare: {
        host: "127.0.0.1",
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(new URL("./migrations", import.meta.url).pathname),
          DATA_KEK_V1: randomBytes(32).toString("base64url"),
        },
        outboundService: () => {
          throw new Error("Network disabled in tests");
        },
      },
    }),
  ],
  test: {
    name: "inbox-worker",
    include: [new URL("./test/*.test.ts", import.meta.url).pathname],
    setupFiles: [new URL("./test/apply-migrations.ts", import.meta.url).pathname],
  },
});
