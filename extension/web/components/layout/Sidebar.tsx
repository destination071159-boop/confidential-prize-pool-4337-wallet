import { NavLink } from "react-router-dom";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

interface NavItem {
  to: string;
  label: string;
  ico: string;
  badge?: string;
}

const OWNER_ITEMS: NavItem[] = [
  { to: "/pool",      label: "Prize Pool", ico: "🎟️", badge: "FHE" },
  { to: "/dashboard", label: "Dashboard", ico: "📊" },
  { to: "/overview",  label: "Overview", ico: "🏠" },
  { to: "/shield",    label: "Shield / Unshield", ico: "🌐" },
  { to: "/limits",    label: "Spending Limits", ico: "🔑" },
  { to: "/send",      label: "Send", ico: "🔒" },
  { to: "/activity",  label: "Activity", ico: "📦" },
];

const KEY_ITEMS: NavItem[] = [
  { to: "/spend", label: "Spend (as key)", ico: "💸" },
];

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-[#fff3c4] text-[#8a6d00] border border-[#f7c948]"
            : "text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.05]"
        }`
      }
    >
      <span className="text-base leading-none">{item.ico}</span>
      <span className="truncate">{item.label}</span>
      {item.badge && (
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#fff3c4] text-[#8a6d00] border border-[#f7c948]">
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <aside className="flex flex-col w-52 shrink-0 min-h-screen border-r border-black/10 bg-white/40 pt-4 pb-6 px-3">
      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1">
        <div className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Owner</div>
        {OWNER_ITEMS.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
        <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">Granted key</div>
        {KEY_ITEMS.map((item) => (
          <NavItemLink key={item.to} item={item} />
        ))}
      </nav>

      {/* Bottom: wallet + network */}
      <div className="mt-4 px-2 flex flex-col gap-3">
        {isConnected && address ? (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="font-mono truncate">{shortenAddress(address)}</span>
            </div>
            <button
              onClick={() => disconnect()}
              className="text-xs text-neutral-500 hover:text-neutral-800 text-left transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="btn-primary text-xs py-1.5 w-full"
          >
            Connect Wallet
          </button>
        )}
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-600" />
          Sepolia Testnet
        </div>
      </div>
    </aside>
  );
}
