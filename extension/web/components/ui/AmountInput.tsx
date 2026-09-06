import { type ChangeEvent } from "react";

interface AmountInputProps {
  value: string;
  onChange: (value: string) => void;
  decimals?: number;
  symbol?: string;
  label?: string;
  placeholder?: string;
  maxValue?: bigint;
  disabled?: boolean;
  error?: string;
}

function formatMax(value: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = value / divisor;
  const frac = value % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}

export function AmountInput({
  value,
  onChange,
  decimals = 18,
  symbol,
  label,
  placeholder = "0.00",
  maxValue,
  disabled = false,
  error,
}: AmountInputProps) {
  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // Allow only valid decimal numbers
    if (raw === "" || /^\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  }

  function handleMax() {
    if (maxValue !== undefined) {
      onChange(formatMax(maxValue, decimals));
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Label row */}
      {(label || maxValue !== undefined) && (
        <div className="flex items-center justify-between">
          {label && <label className="text-sm text-neutral-600 font-medium">{label}</label>}
          {maxValue !== undefined && (
            <button
              type="button"
              onClick={handleMax}
              disabled={disabled}
              className="text-xs text-[#8a6d00] hover:text-[#6b5500] transition-colors disabled:opacity-40"
            >
              Max: {formatMax(maxValue, decimals)} {symbol}
            </button>
          )}
        </div>
      )}

      {/* Input row */}
      <div className={`relative flex items-center input-field p-0 overflow-hidden ${error ? "border-red-600 focus-within:ring-red-500" : ""}`}>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 bg-transparent px-3 py-2 text-sm text-neutral-900 placeholder-gray-400
                     focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {symbol && (
          <span className="shrink-0 pr-3 text-sm font-semibold text-neutral-600">{symbol}</span>
        )}
      </div>

      {/* Error */}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
