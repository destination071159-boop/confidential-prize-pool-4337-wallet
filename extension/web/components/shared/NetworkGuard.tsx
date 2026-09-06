import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { sepolia } from "wagmi/chains";
import type { ReactNode } from "react";

interface NetworkGuardProps {
  children: ReactNode;
}

export function NetworkGuard({ children }: NetworkGuardProps) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  // Not connected — show content (connect prompt appears in Navbar)
  if (!isConnected) return <>{children}</>;

  // Connected but wrong network
  if (chainId !== sepolia.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 animate-fade-in">
        <div className="text-5xl">⚠️</div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-neutral-900 mb-2">Wrong Network</h2>
          <p className="text-neutral-600 max-w-sm">
            Confidential Prize Pool 4337 Wallet runs on <strong className="text-neutral-900">Sepolia Testnet</strong>.
            Switch your wallet to Sepolia to continue.
          </p>
        </div>
        <button
          onClick={() => switchChain({ chainId: sepolia.id })}
          disabled={isPending}
          className="btn-primary"
        >
          {isPending ? "Switching..." : "Switch to Sepolia"}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
