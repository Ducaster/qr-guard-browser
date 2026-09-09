import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  build: {
    outDir: ".vite/renderer/main_window",
    target: "chrome124"
  },
  clearScreen: false,
  ...(mode === "production" ? { esbuild: { drop: ["console", "debugger"] } } : {}),
  plugins: [react()]
}));
