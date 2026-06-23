import { defineConfig } from "vite";
import { builtinModules } from "node:module";

const external = ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)];

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/preload/qr-site.ts",
      fileName: () => "qr-site-preload.js",
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
