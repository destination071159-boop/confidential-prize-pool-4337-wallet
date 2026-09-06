/**
 * Extension-specific wagmi config. Unlike apps/web (which uses injected()/metaMask()/
 * walletConnect()), the ONLY connector here is the in-extension keyring, exposed through
 * the internal EIP-1193 provider. wagmi treats it like an injected wallet, so useAccount,
 * useWalletClient, useChainId, etc. all work — backed by keys the extension custodies.
 */

import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { internalProvider } from "./internalProvider";

export const keyringConnector = injected({
  shimDisconnect: false,
  target: () => ({
    id: "zhieldwrap",
    name: "ZhieldWrap",
    provider: internalProvider as never,
  }),
});

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [keyringConnector],
  transports: {
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});
