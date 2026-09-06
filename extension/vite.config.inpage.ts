import { defineConfig } from "vite";
import path from "path";
import { sharedResolve, sharedDefine, sharedBuild } from "./vite.config";

// Inpage provider — runs in the page MAIN world. Built as a self-contained IIFE (no ES module
// imports at runtime) so it can be injected via a <script src> tag by the content script.
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
      entry: path.resolve(__dirname, "src/chrome/inpage.ts"),
      name: "ZhieldWrapInpage",
    },
    rollupOptions: {
      output: { entryFileNames: "inpage.js", extend: true },
    },
  },
});
