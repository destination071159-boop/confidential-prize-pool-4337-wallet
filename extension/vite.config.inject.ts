import { defineConfig } from "vite";
import path from "path";
import { sharedResolve, sharedDefine, sharedBuild } from "./vite.config";

// Content script — runs in the page ISOLATED world at document_start. Built as an IIFE so it
// loads as a classic content script (no ES module semantics).
export default defineConfig({
  resolve: sharedResolve,
  define: sharedDefine,
  publicDir: false,
  build: {
    ...sharedBuild,
    outDir: "build/static/js",
    emptyOutDir: false,
    lib: {
      formats: ["iife"],
      entry: path.resolve(__dirname, "src/chrome/inject.ts"),
      name: "ZhieldWrapInject",
    },
    rollupOptions: {
      output: { entryFileNames: "inject.js", extend: true },
    },
  },
});
