import { readFile, writeFile } from "node:fs/promises";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const key = input.trim();
if (!/^[A-Za-z0-9_-]{43}$/.test(key) || Buffer.from(key, "base64url").length !== 32)
  throw new Error("Expected generated 32-byte key");
const path = "apps/inbox-worker/.dev.vars";
const current = await readFile(path, "utf8");
if (!current.includes("DATA_KEK_V1=REPLACE_WITH_OUTPUT_OF_gen-kek"))
  throw new Error("Refusing to overwrite an existing encryption key");
await writeFile(path, current.replace("DATA_KEK_V1=REPLACE_WITH_OUTPUT_OF_gen-kek", `DATA_KEK_V1=${key}`), {
  mode: 0o600,
});
