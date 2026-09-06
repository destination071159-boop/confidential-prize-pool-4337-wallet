import { useState, useRef, useEffect } from "react";
import type { RegistryPair } from "@zhieldwrap/core";

interface TokenSelectorProps {
  pairs: RegistryPair[];
  selectedAddress: string;
  onChange: (address: string) => void;
  label?: string;
  disabled?: boolean;
}

function truncate(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function TokenSelector({
  pairs,
  selectedAddress,
  onChange,
  label,
  disabled = false,
}: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = pairs.find(
    (p) => p.erc7984Address.toLowerCase() === selectedAddress.toLowerCase()
  );

  const filtered = pairs.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.symbol.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.erc7984Address.toLowerCase().includes(q)
    );
  });

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && <label className="text-sm text-neutral-600 font-medium">{label}</label>}

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="input-field flex items-center justify-between cursor-pointer text-left"
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-neutral-900">{selected.symbol}</span>
            <span className="text-neutral-500 text-xs truncate">{selected.name}</span>
            {selected.isOfficial && (
              <span className="badge-official text-[10px] px-1.5 py-0.5 shrink-0">Official</span>
            )}
          </div>
        ) : (
          <span className="text-neutral-500">Select token…</span>
        )}
        <span className={`ml-2 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-72 bg-white/70 border border-black/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-black/10">
            <input
              autoFocus
              type="text"
              placeholder="Search by symbol or address…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field text-xs py-1.5"
            />
          </div>

          {/* List */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 text-center">No tokens found</li>
            )}
            {filtered.map((pair) => (
              <li key={pair.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(pair.erc7984Address);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-black/[0.05] transition-colors text-left ${
                    pair.erc7984Address.toLowerCase() === selectedAddress.toLowerCase()
                      ? "bg-[#fff3c4] text-[#8a6d00]"
                      : "text-neutral-900"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{pair.symbol}</span>
                      {pair.isOfficial && (
                        <span className="badge-official text-[10px] px-1.5 py-0.5">Official</span>
                      )}
                      {pair.isCustom && (
                        <span className="badge-custom text-[10px] px-1.5 py-0.5">Custom</span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-500 font-mono truncate">
                      {truncate(pair.erc7984Address)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
