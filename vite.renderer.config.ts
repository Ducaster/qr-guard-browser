import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: ".vite/renderer/main_window"
  },
  clearScreen: false,
  plugins: [react()]
});
