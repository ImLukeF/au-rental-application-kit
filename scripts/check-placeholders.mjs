import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function violations(text, path = "") {
  const errors = [];
  for (const [name, re] of [
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["token", /(?:ghp_|github_pat_|sk_live_|xox[baprs]-)[A-Za-z0-9_-]{8,}/],
    ["account identifier", /\b[a-f\d]{32}\b/i],
  ])
    if (re.test(text)) errors.push(name);
  for (const m of text.matchAll(/\b[A-Z\d._%+-]+@[A-Z\d.-]+\.[A-Z]{2,}\b/gi))
    if (!/@example\.(com|org|net)$/i.test(m[0])) errors.push("non-example email");
  for (const m of text.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g))
    if (m[0] !== "127.0.0.1" && !(m[0] === "0.0.0.0" && /check-placeholders|\.md$/.test(path)))
      errors.push("IP address");
  if (
    /wrangler.*\.jsonc$/.test(path) &&
    /[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}/i.test(
      text.replaceAll([8, 4, 4, 4, 12].map((n) => "0".repeat(n)).join("-"), ""),
    )
  )
    errors.push("database identifier");
  return errors;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  const files = paths.length
    ? paths
    : execFileSync("git", ["ls-files", "-z"]).toString().split("\0").filter(Boolean);
  for (const path of files) {
    if (/pnpm-lock\.yaml$|\.ttf$|\.png$|\.pdf$/.test(path)) continue;
    const errors = violations(readFileSync(path, "utf8"), path);
    if (errors.length) {
      console.error(`${path}: ${[...new Set(errors)].join(", ")}`);
      process.exitCode = 1;
    }
  }
}
