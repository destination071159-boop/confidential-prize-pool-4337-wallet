import type { TxStatus } from "@zhieldwrap/core";

interface TxStatusModalProps {
  txStatus: TxStatus | null;
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

export function TxStatusModal({ txStatus, isOpen, onClose, onRetry }: TxStatusModalProps) {
  if (!isOpen || !txStatus) return null;

  const explorerUrl = txStatus.hash
    ? `https://sepolia.etherscan.io/tx/${txStatus.hash}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="card max-w-md w-full animate-fade-in">
        <div className="text-center py-4">
          {txStatus.status === "pending" && (
            <>
              <div className="flex justify-center mb-3">
                <svg className="animate-spin w-10 h-10 text-[#8a6d00]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-1">Transaction Pending</h3>
              <p className="text-neutral-600 text-sm">{txStatus.message}</p>
            </>
          )}

          {txStatus.status === "confirmed" && (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-1">Transaction Confirmed</h3>
              <p className="text-neutral-600 text-sm mb-4">{txStatus.message}</p>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8a6d00] hover:text-[#6b5500] text-sm underline"
                >
                  View on Etherscan ↗
                </a>
              )}
              {txStatus.blockNumber && (
                <div className="text-xs text-neutral-500 mt-2">
                  Block #{txStatus.blockNumber}
                </div>
              )}
            </>
          )}

          {txStatus.status === "failed" && (
            <>
              <div className="text-4xl mb-3">❌</div>
              <h3 className="text-lg font-semibold text-neutral-900 mb-1">Transaction Failed</h3>
              <p className="text-neutral-600 text-sm mb-4">{txStatus.message}</p>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-2">
          {txStatus.status === "failed" && onRetry && (
            <button onClick={onRetry} className="btn-primary flex-1">
              Retry
            </button>
          )}
          <button onClick={onClose} className="btn-secondary flex-1">
            {txStatus.status === "confirmed" ? "Done" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
