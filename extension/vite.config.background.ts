import { defineConfig } from "vite";
import path from "path";
import { sharedResolve, sharedDefine, sharedBuild } from "./vite.config";

// Builds the MV3 background service worker as a single ES module into the shared
// build/ dir WITHOUT wiping it (emptyOutDir:false) and WITHOUT copying public/ again.
export default defineConfig({
  resolve: sharedResolve,
  define: sharedDefine,
  plugins: [], // no React in the service worker
  publicDir: false,
  build: {
    ...sharedBuild,
    outDir: "build/static/js",
    emptyOutDir: false,
    lib: {
      formats: ["es"],
      entry: path.resolve(__dirname, "src/background.ts"),
      name: "background",
    },
    rollupOptions: {
      output: {
        entryFileNames: "background.js",
      },
    },
  },
});
