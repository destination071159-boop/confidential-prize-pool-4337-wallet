import { useEffect, useState } from "react";
import { REGISTRY, type Asset } from "@zhieldwrap/core";

/** User-added confidential (ERC-7984) tokens, merged into the built-in registry. */
const KEY = "c4337_custom_tokens";
const EVENT = "c4337-tokens";

export function getCustomTokens(): Asset[] {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Asset[]) : [];
  } catch {
    return [];
  }
}

export function addCustomToken(a: Asset): void {
  try {
    const existing = getCustomTokens().filter((t) => t.token.toLowerCase() !== a.token.toLowerCase());
    localStorage.setItem(KEY, JSON.stringify([...existing, a].slice(0, 50)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function removeCustomToken(token: string): void {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify(getCustomTokens().filter((t) => t.token.toLowerCase() !== token.toLowerCase()))
    );
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

/** Built-in registry + user-added tokens (deduped by address, built-ins win). */
export function mergedAssets(custom: Asset[]): Asset[] {
  const seen = new Set(REGISTRY.map((a) => a.token.toLowerCase()));
  return [...REGISTRY, ...custom.filter((a) => !seen.has(a.token.toLowerCase()))];
}

export function useCustomTokens(): Asset[] {
  const [items, setItems] = useState<Asset[]>([]);
  useEffect(() => {
    const update = () => setItems(getCustomTokens());
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return items;
}

/** The full asset list every screen should use (built-in + custom). */
export function useAssets(): Asset[] {
  const custom = useCustomTokens();
  return mergedAssets(custom);
}
