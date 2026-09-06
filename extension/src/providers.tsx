import React, { useMemo, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "./zama/shim";
import { WagmiSigner } from "./zama/wagmi";
import { wagmiConfig } from "./wallet/wagmi.config";

/**
 * Extension provider tree.
 *
 * Unlike apps/web (which uses the @zama-fhe/react-sdk worker+WASM path — unavailable under the
 * MV3 CSP), the extension uses our UMD-backed FHE shim. The Zama signer is a WagmiSigner bound to
 * the keyring wagmi config, so the userDecrypt EIP-712 is signed by the in-extension key
 * (auto-approved in the background — no prompt).
 */
export function ExtensionProviders({
  children,
  Router,
}: {
  children: React.ReactNode;
  Router: React.ComponentType<{ children: React.ReactNode }>;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
      })
  );

  const signer = useMemo(() => new WagmiSigner({ config: wagmiConfig }), []);

  return (
    <WagmiProvider config={wagmiConfig as never}>
      <QueryClientProvider client={queryClient}>
        <ZamaProvider signer={signer}>
          <Router>{children}</Router>
        </ZamaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
