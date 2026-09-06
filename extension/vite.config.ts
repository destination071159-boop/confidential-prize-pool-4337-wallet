import { defineConfig, Plugin, BuildOptions } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Same shim apps/web uses: wagmi@2.19.5 removed `watchConnection`, which the
// @zama-fhe/react-sdk/wagmi adapter still imports. Inject a no-op so Rollup builds.
function wagmiCompatPlugin(): Plugin {
  return {
    name: "wagmi-watch-connection-shim",
    transform(code, id) {
      if (id.includes("wagmi") && id.includes("actions.js") && !id.includes("@wagmi/core")) {
        if (!code.includes("watchConnection")) {
          return { code: code + "\nexport const watchConnection = () => () => {};", map: null };
        }
      }
    },
  };
}

export const sharedResolve = {
  alias: {
    // FHE SDK shim: the upstream @zama-fhe/react-sdk worker `importScripts` from cdn.zama.org,
    // which the MV3 CSP blocks. Redirect the shared apps/web imports to our UMD-backed shim.
    // NOTE: the `/wagmi` subpath entry MUST come before the base entry (first match wins).
    "@zama-fhe/react-sdk/wagmi": path.resolve(__dirname, "src/zama/wagmi.ts"),
    "@zama-fhe/react-sdk": path.resolve(__dirname, "src/zama/shim.tsx"),
    // Inlined confidential-token logic (was packages/core)
    "@zhieldwrap/core": path.resolve(__dirname, "core/index.ts"),
    // Inlined web app React UI (was apps/web/src)
    "@web": path.resolve(__dirname, "web"),
  },
};

export const sharedDefine = {
  // Required by several web3 libraries when there's no Node `global`.
  global: "globalThis",
};

export const sharedBuild: BuildOptions = {
  minify: "terser",
  terserOptions: {
    // ethers / relayer-sdk rely on class & function names surviving minification.
    keep_classnames: true,
    keep_fnames: true,
  },
};

export default defineConfig({
  plugins: [react(), wagmiCompatPlugin()],
  resolve: sharedResolve,
  define: sharedDefine,
  optimizeDeps: {
    include: ["ethers", "wagmi", "viem", "abstractionkit"],
    exclude: ["@zama-fhe/react-sdk", "@zama-fhe/sdk"],
  },
  build: {
    ...sharedBuild,
    outDir: "build",
    // Only this (first) build copies public/ (manifest, icons, popup-init) into build/.
    rollupOptions: {
      // snarkjs MUST be bundled (not external): the extension can't resolve a bare `import("snarkjs")`
      // at runtime (no CDN under MV3 CSP), so leaving it external makes ZK proving fall back to a
      // mock proof that the on-chain verifier rejects.
      input: {
        // Side-panel + popup entry (the React app)
        main: path.resolve(__dirname, "index.html"),
      },
      output: {
        entryFileNames: "static/js/[name].js",
        chunkFileNames: "static/js/[name]-[hash].js",
        assetFileNames: "static/[ext]/[name]-[hash].[ext]",
      },
    },
  },
});
