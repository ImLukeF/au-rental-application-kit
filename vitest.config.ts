import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "packages",
          include: ["packages/**/test/*.test.ts", "scripts/*.test.ts"],
          environment: "node",
          setupFiles: ["./test/no-network.ts"],
        },
      },
      {
        test: {
          name: "renter",
          include: ["apps/renter/test/*.test.{ts,tsx}"],
          environment: "happy-dom",
          setupFiles: ["./test/no-network.ts", "fake-indexeddb/auto"],
        },
      },
      {
        test: {
          name: "agent-ui",
          include: ["apps/agent-ui/test/*.test.{ts,tsx}"],
          environment: "happy-dom",
          setupFiles: ["./test/no-network.ts"],
        },
      },
      "./apps/inbox-worker/vitest.config.ts",
    ],
  },
});
