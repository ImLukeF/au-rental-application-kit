import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// @ts-expect-error Plain ESM guard.
import { denied } from "./check-deps.mjs";
// @ts-expect-error Plain ESM guard.
import { violations } from "./check-placeholders.mjs";

describe("public repository guards", () => {
  it("rejects a planted non-example email", () => {
    const dir = mkdtempSync(".scratch/guard-");
    try {
      writeFileSync(`${dir}/input.txt`, ["someone", "invalid.test"].join("@"));
      expect(() =>
        execFileSync("node", ["scripts/check-placeholders.mjs", `${dir}/input.txt`], { stdio: "pipe" }),
      ).toThrow();
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
  it("permits examples and rejects non-loopback IPs and keys", () => {
    expect(violations("applicant1@example.com 127.0.0.1")).toEqual([]);
    expect(violations(["192", "168", "1", "1"].join("."))).toContain("IP address");
    expect(violations(["-----BEGIN", "PRIVATE KEY-----"].join(" "))).toContain("private key");
  });
  it("denies tracking and payments", () => {
    expect(denied({ dependencies: { "@stripe/example": "1", "posthog-js": "1", zod: "4" } })).toEqual([
      "@stripe/example",
      "posthog-js",
    ]);
  });
});
