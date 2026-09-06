# Confidential Prize Pool 4337 Wallet — extension

This is the **wallet extension** (the demo surface) for the Confidential Prize Pool.

👉 **Full documentation is in the repository root: [`../README.md`](../README.md)** — architecture, the weighted-draw algorithm, confidentiality/leakage design, yield mock, data flows, and security model.

## Build (quick)

```bash
pnpm install
cp .env.example .env      # fill in Sepolia RPC + Pimlico bundler/paymaster
pnpm build                # → build/
```

Then `chrome://extensions` → Developer mode → **Load unpacked** → `build/` → open the wallet → **Prize Pool** tab. Follow [`step.txt`](step.txt) for the full demo cycle. `draw()` is owner-only.

- `pnpm type-check` — `tsc --noEmit`
- `pnpm package` / `pnpm package:cws` — zip `build/` (the `:cws` variant strips `key`/`update_url` for the Chrome Web Store)

The companion contract is in [`../contracts`](../contracts).
