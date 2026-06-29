import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const isProduction = process.env["NODE_ENV"] === "production";

export default defineConfig({
  base: "./",
  build: {
    outDir: ".vite/renderer/main_window",
    target: "chrome124"
  },
  clearScreen: false,
  ...(isProduction ? { esbuild: { drop: ["console", "debugger"] } } : {}),
  plugins: [react()]
});
