import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { useEffect } from "react";
import { useGasSaved, formatEthShort } from "../../lib/gasSaved";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function GasBox() {
  const wei = useGasSaved();
  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 bg-white rounded-xl px-2.5 py-1.5 border border-black/10"
      title="Gas covered by the paymaster — your smart account paid 0"
    >
      <span>⛽</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wide text-neutral-500">Gas sponsored</span>
        <span className="text-xs font-semibold text-[color:var(--text)]">{formatEthShort(wei)} ETH</span>
      </span>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fff3c4] text-[#8a6d00] border border-[#f7c948]">
        ⚡ gasless
      </span>
    </span>
  );
}

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && chainId !== sepolia.id;

  // Sync connected address to localStorage so the dApp provider bridge can read it.
  useEffect(() => {
    if (address) localStorage.setItem("zhieldwrap:wallet-address", address);
    else localStorage.removeItem("zhieldwrap:wallet-address");
  }, [address]);

  return (
    <nav className="border-b border-black/10 bg-white/85 backdrop-blur-sm sticky top-0 z-50">
      <div className="px-4">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-9 h-9 rounded-xl grid place-items-center text-base shrink-0 border border-white"
              style={{ background: "var(--grad-accent)", boxShadow: "var(--shadow-btn-accent)" }}
            >
              🔒
            </span>
            <div className="min-w-0 leading-tight">
              <div className="font-bold text-sm text-neutral-900 truncate">Confidential Prize Pool 4337 Wallet</div>
              <div className="text-[11px] text-neutral-500 truncate">No-loss prize savings · Zama FHE · gasless</div>
            </div>
          </div>

          {/* Right: gas + wallet */}
          <div className="flex items-center gap-2 shrink-0">
            <GasBox />
            {isWrongNetwork && (
              <span className="text-xs text-red-600 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-md">
                Wrong Network
              </span>
            )}
            {isConnected && address ? (
              <>
                <span className="hidden sm:inline text-xs text-neutral-700 bg-black/[0.04] px-3 py-1.5 rounded-lg font-mono">
                  {shortenAddress(address)}
                </span>
                <button onClick={() => disconnect()} className="btn-secondary text-xs px-3 py-1.5">
                  Disconnect
                </button>
              </>
            ) : (
              <button onClick={() => connect({ connector: injected() })} className="btn-primary text-xs">
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
