import { useState } from "react";
import type { RegistryPair } from "@zhieldwrap/core";
import { useNavigate } from "react-router-dom";

interface PairCardProps {
  pair: RegistryPair;
}

function truncateAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-neutral-500 hover:text-neutral-800 transition-colors text-xs px-1"
      title="Copy address"
    >
      {copied ? "✓" : "⎘"}
    </button>
  );
}

function AddressRow({
  label,
  address,
}: {
  label: string;
  address: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <div className="flex items-center gap-1">
        <a
          href={`https://sepolia.etherscan.io/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[#8a6d00] hover:text-[#6b5500] transition-colors"
        >
          {truncateAddress(address)}
        </a>
        <CopyButton text={address} />
      </div>
    </div>
  );
}

export function PairCard({ pair }: PairCardProps) {
  const navigate = useNavigate();

  return (
    <div className="card hover:border-[#f7c948] transition-colors animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#fff3c4] border border-[#f7c948] flex items-center justify-center text-sm font-bold text-[#8a6d00] shrink-0">
            {pair.underlyingSymbol.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-neutral-900 text-sm leading-tight">{pair.name}</div>
            <div className="text-xs text-neutral-600 mt-0.5">
              {pair.underlyingSymbol} → {pair.symbol}
            </div>
          </div>
        </div>
        <div className="flex flex-row items-start gap-1 flex-wrap justify-end">
          {pair.isOfficial && (
            <span className="badge-official">✓ Official</span>
          )}
          {pair.isCustom && (
            <span className="badge-custom" title="Not in the official Zama registry. Use at your own risk.">
              ⚠ Custom
            </span>
          )}
          {pair.isActive ? (
            <span className="badge-active">● Active</span>
          ) : (
            <span className="badge-inactive">○ Inactive</span>
          )}
        </div>
      </div>

      {/* Addresses */}
      <div className="space-y-1 mb-4 bg-white/60 rounded-lg p-3 border border-black/10">
        <AddressRow label="ERC-20" address={pair.erc20Address} />
        <AddressRow label="ERC-7984" address={pair.erc7984Address} />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/wrap/${pair.id}?mode=wrap`)}
          className="btn-primary flex-1 text-xs py-1.5"
        >
          Wrap
        </button>
        <button
          onClick={() => navigate(`/wrap/${pair.id}?mode=unwrap`)}
          className="btn-secondary flex-1 text-xs py-1.5"
        >
          Unwrap
        </button>
        {pair.hasFaucet && (
          <button
            onClick={() => navigate(`/faucet?token=${pair.erc20Address}`)}
            className="btn-secondary text-xs py-1.5 px-3"
            title="Get test tokens from faucet"
          >
            🚿
          </button>
        )}
      </div>
    </div>
  );
}
