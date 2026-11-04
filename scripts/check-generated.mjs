import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";

await mkdir(".scratch", { recursive: true });
const dir = await mkdtemp(".scratch/generated-");
try {
  execFileSync("pnpm", ["gen", "--", dir], { stdio: "inherit" });
  for (const path of [
    "docs/rules.md",
    "schemas/application.v1.schema.json",
    "schemas/profile-backup.v1.schema.json",
    "schemas/listing-public.v1.schema.json",
    "packages/rules/src/version.ts",
  ])
    if (!(await readFile(path)).equals(await readFile(`${dir}/${path}`)))
      throw new Error(`Stale generated file: ${path}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
