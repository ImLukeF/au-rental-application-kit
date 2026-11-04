import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
export function fontAssets(): Plugin {
  return {
    name: "self-hosted-pdf-fonts",
    generateBundle() {
      for (const name of ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "OFL.txt"])
        this.emitFile({
          type: "asset",
          fileName: `fonts/${name}`,
          source: readFileSync(new URL(`../packages/pdf/fonts/${name}`, import.meta.url)),
        });
    },
  };
}
