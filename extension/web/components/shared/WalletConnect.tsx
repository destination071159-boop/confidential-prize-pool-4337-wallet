import { useAccount, useConnect, useDisconnect, useChainId } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface WalletConnectProps {
  /** Render as a compact icon-only button (for mobile / tight spaces) */
  compact?: boolean;
}

/**
 * WalletConnect
 * Self-contained wallet connect / disconnect button.
 * Shows address when connected, prompts connection when not.
 * Displays a warning when the user is on the wrong network.
 */
export function WalletConnect({ compact = false }: WalletConnectProps) {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const isWrongNetwork = isConnected && chainId !== sepolia.id;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {isWrongNetwork && !compact && (
          <span className="text-xs text-red-600 bg-red-900/30 border border-red-800 px-2 py-1 rounded-md">
            Wrong Network
          </span>
        )}
        <div className={`flex items-center gap-1.5 bg-black/[0.04] border border-black/10 rounded-lg ${compact ? "px-2 py-1" : "px-3 py-1.5"}`}>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${isWrongNetwork ? "bg-red-500" : "bg-green-500"}`}
          />
          {!compact && (
            <span className="text-xs text-neutral-700 font-mono">{shortenAddress(address)}</span>
          )}
        </div>
        <button
          onClick={() => disconnect()}
          className="btn-secondary text-xs px-3 py-1.5"
        >
          {compact ? "✕" : "Disconnect"}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isPending}
      className="btn-primary text-sm"
    >
      {isPending ? "Connecting…" : compact ? "Connect" : "Connect Wallet"}
    </button>
  );
}
