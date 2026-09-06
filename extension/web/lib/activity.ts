import { useEffect, useState } from "react";

export type ActivityType =
  | "setup"
  | "wrap"
  | "unwrap"
  | "grant"
  | "revoke"
  | "send"
  | "spend";

export type Activity = {
  id: string;
  type: ActivityType;
  label: string;
  asset?: string;
  hash: string;
  isUserOp: boolean;
  gasless: boolean;
  ts: number;
};

const KEY = "c4337_activity";
const EVENT = "c4337-activity";
const MAX = 60;

export function getActivities(): Activity[] {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Activity[]) : [];
  } catch {
    return [];
  }
}

export function recordActivity(a: Omit<Activity, "id" | "ts">) {
  try {
    const item: Activity = { ...a, id: Math.random().toString(36).slice(2), ts: Date.now() };
    const next = [item, ...getActivities()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function clearActivities() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* ignore */
  }
}

export function useActivities(): Activity[] {
  const [items, setItems] = useState<Activity[]>([]);
  useEffect(() => {
    const update = () => setItems(getActivities());
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

export function explorerUrl(a: Activity): string {
  // Always link to Etherscan — our flows resolve the real on-chain tx hash.
  return `https://sepolia.etherscan.io/tx/${a.hash}`;
}

const ICONS: Record<ActivityType, string> = {
  setup: "⚙️",
  wrap: "🪙",
  unwrap: "🔓",
  grant: "🔑",
  revoke: "⛔",
  send: "🔒",
  spend: "💸",
};
export const activityIcon = (t: ActivityType) => ICONS[t];

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
