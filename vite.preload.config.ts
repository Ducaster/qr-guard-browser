import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const external = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/preload/index.ts",
      fileName: () => "preload.js",
      formats: ["cjs"]
    },
    outDir: ".vite/build",
    rollupOptions: {
      external
    },
    sourcemap: true
  },
  clearScreen: false
});
