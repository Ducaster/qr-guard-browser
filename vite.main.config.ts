import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const external = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];
const shouldEmitSourceMaps = process.env["NODE_ENV"] === "production" ? false : true;

export default defineConfig({
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
    sourcemap: shouldEmitSourceMaps
  },
  clearScreen: false
});
