import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fontAssets } from "../../scripts/vite-fonts";
export default defineConfig({
  plugins: [react(), fontAssets()],
  base: "/agent/",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: { target: "es2023" },
});
