import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
export function denied(manifest) {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  }).filter((name) =>
    /^(?:stripe$|@stripe\/|posthog|@sentry\/|mixpanel|@segment\/|google-analytics$|gtag$|@datadog\/|hotjar$|amplitude)/i.test(
      name,
    ),
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of [
    "package.json",
    ...["apps", "packages"].flatMap((dir) => readdirSync(dir).map((name) => `${dir}/${name}/package.json`)),
  ])
    if (denied(JSON.parse(readFileSync(file, "utf8"))).length) {
      console.error(`Disallowed dependencies in ${file}`);
      process.exitCode = 1;
    }
}
