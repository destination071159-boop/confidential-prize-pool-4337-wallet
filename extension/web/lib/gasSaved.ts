import { useEffect, useState } from "react";

const KEY = "c4337_gas_sponsored_wei";
const EVENT = "c4337-gas";

export function recordGasSaved(wei: bigint) {
  try {
    const prev = BigInt(localStorage.getItem(KEY) ?? "0");
    localStorage.setItem(KEY, (prev + wei).toString());
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function getGasSaved(): bigint {
  try {
    return BigInt(localStorage.getItem(KEY) ?? "0");
  } catch {
    return 0n;
  }
}

export function useGasSaved(): bigint {
  const [wei, setWei] = useState<bigint>(0n);
  useEffect(() => {
    const update = () => setWei(getGasSaved());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return wei;
}

export function formatEthShort(wei: bigint): string {
  if (wei === 0n) return "0";
  const eth = Number(wei) / 1e18;
  if (eth < 0.00001) return "<0.00001";
  return eth.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");
}
