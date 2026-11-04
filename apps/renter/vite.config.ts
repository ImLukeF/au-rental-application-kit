import { fontAssets } from "../../scripts/vite-fonts";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [react(), fontAssets()],
  base: "/",
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: { target: "es2023" },
});
