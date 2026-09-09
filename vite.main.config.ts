import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const external = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/main/index.ts",
      fileName: () => "main.js",
      formats: ["cjs"]
    },
    outDir: ".vite/build",
    rollupOptions: {
      external
    },
    sourcemap: mode !== "production"
  },
  clearScreen: false
}));
