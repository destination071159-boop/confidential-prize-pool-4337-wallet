import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { ExtensionProviders } from "./providers";
import { WalletGate } from "./wallet/WalletGate";
import App from "@web/App";
import "@web/index.css";

/**
 * Extension entry (side panel).
 *
 * Phase 2: the in-extension keyring is the wallet. ExtensionProviders binds wagmi + the Zama
 * FHE signer to the keyring connector; WalletGate handles onboarding / unlock and auto-connects
 * wagmi once the vault is open, then renders the reused apps/web App.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ExtensionProviders Router={HashRouter}>
      <WalletGate>
        <App />
      </WalletGate>
    </ExtensionProviders>
  </React.StrictMode>
);
