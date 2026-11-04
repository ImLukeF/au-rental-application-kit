import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { POLICIES } from "../packages/rules/src/policies";
import data from "../packages/rules/src/registry-data.json";

const output = process.argv.filter((arg) => arg !== "--")[2] ?? ".";
async function write(file: string, text: string) {
  const dest = path.join(output, file);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, text);
}
await write(
  "packages/rules/src/version.ts",
  `export const registryVersion = "sha256:${createHash("sha256")
    .update(JSON.stringify({ rules: data, policies: POLICIES }))
    .digest("hex")}";\n`,
);
await write(
  "docs/rules.md",
  `# Rules registry\n\nPlan checked 2026-11-04. Not legal advice. NSW PPI rules are PROVISIONAL; final Act UNVERIFIED.\n\n| Rule | Summary | Commencement | Confidence | Sources |\n|---|---|---|---|---|\n${data.map((r) => `| ${r.id} | ${r.summary} ${"notes" in r ? r.notes : ""} | ${JSON.stringify(r.commencement)} | ${r.confidence} | ${r.citations.map((c) => `[${c.pinpoint}](${c.url}) (checked ${c.checkedOn})`).join("; ")} |`).join("\n")}\n`,
);
const { z } = await import("zod");
const { applicationSchema, listingSchema, backupSchema } = await import("../packages/forms/src/index");
for (const [name, schema] of [
  ["application.v1", applicationSchema],
  ["listing-public.v1", listingSchema],
  ["profile-backup.v1", backupSchema],
] as const) {
  await write(`schemas/${name}.schema.json`, `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`);
}
