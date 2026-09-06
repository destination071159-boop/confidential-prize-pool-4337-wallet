# Confidential Prize Pool 4337 Wallet

A **no-loss, prize-savings dApp made confidential with the Zama FHE protocol** — a PoolTogether where deposits, balances, odds, and the winner are all **encrypted on-chain**, and the winner is drawn **on-chain** by FHE randomness weighted by deposit size. You can only win; your principal is withdrawable in full, any time. Shipped as a **gasless ERC-4337 wallet extension** (the demo surface), backed by the `ConfidentialPrizePool.sol` contract. Sepolia testnet.

> **Headline.** Deposit confidential tokens; your amount is encrypted before it leaves the browser. At each draw the contract runs an **on-chain, deposit-weighted winner selection over encrypted balances** using `FHE.randEuint64` — no offchain RNG, no plaintext balances, no operator discretion. The prize lands as an **encrypted winnings balance**, so only the winner ever learns they won. Principal is **no-loss**: withdrawable in full at any time, clamped in FHE so a withdrawal never leaks a balance. Every step is a **gasless** 4337 UserOperation. Remove FHE, the ERC-7984 layer, *or* account abstraction and it collapses.

**Live contract (Sepolia):** [`0xD24FBf0F84C9f1AfCc63354498b8f1B3AF6f1067`](https://sepolia.etherscan.io/address/0xD24FBf0F84C9f1AfCc63354498b8f1B3AF6f1067)

---

## Repository layout

| Folder | What it is |
|---|---|
| [`contracts/`](contracts) | `ConfidentialPrizePool.sol` — the FHE prize-pool contract + Hardhat tests (3 passing) + deploy script + the live Sepolia deployment. |
| [`extension/`](extension) | The **Confidential Prize Pool 4337 Wallet** — a Chromium MV3 wallet that runs the full cycle (deposit → reveal → draw → claim → withdraw), all gasless. This is the demo surface. |
| [`extension/landing/`](extension/landing) | A standalone marketing landing page (static HTML, host anywhere). |
| [`extension/step.txt`](extension/step.txt) | The ~3-minute demo script. |

---

## Table of Contents

- [How it works](#how-it-works)
- [Features & the problems they solve](#features--the-problems-they-solve)
- [Confidentiality & leakage design](#confidentiality--leakage-design)
- [The weighted draw (the moat)](#the-weighted-draw-the-moat)
- [Yield source (mock)](#yield-source-mock)
- [Supported Network & Contracts](#supported-network--contracts)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Key Data Flows](#key-data-flows)
- [Security Model](#security-model)
- [Quick start](#quick-start)
- [Environment Notes](#environment-notes)
- [Future Work](#future-work)
- [License](#license)

---

## How it works

1. **Deposit** confidential cUSDC. Your amount is encrypted in the browser before it's sent (ERC-7984 `confidentialTransferAndCall`), so the pool credits an `euint64` balance nobody can read.
2. **Your balance & winnings** are ciphertext on-chain; you reveal your own with an EIP-712 user-decryption (via an ACL delegation, since a 4337 smart account holds them).
3. **Draw** runs on-chain: `r = FHE.randEuint64()`, a scaled ticket `r · total` is tested against each depositor's encrypted prefix sum — deposit-weighted, exact, no encrypted division, `euint128` to avoid overflow. The prize lands as an **encrypted** winnings balance, so only the winner learns they won.
4. **Claim** pays the winner (a confidential transfer); everyone else claims 0 with no leak.
5. **Withdraw** your principal any time — clamped in FHE (`select(ge(bal,req), req, bal)`) so it's no-loss and never reveals a balance.

Every step is a **gasless** ERC-4337 UserOperation (Safe + EntryPoint v0.7, Pimlico paymaster).

---

## Features & the problems they solve

### 🎟️ Confidential Prize Pool — the headline
**Problem.** A prize-savings pool (PoolTogether) is a great primitive, but on a transparent chain it leaks everything: every deposit size, every balance, each player's exact odds, and — worst — the RNG and winner are either off-chain (trust the operator) or fully public (gameable). "Fair lottery" and "public ledger" are in tension.

**Solution.** Deposits are ERC-7984 confidential transfers, so **amounts and balances are ciphertext**. The **winner is drawn on-chain** with `FHE.randEuint64` and settled over the *encrypted* balances — **deposit-weighted, exact, verifiable, and blind** (§ [The weighted draw](#the-weighted-draw-the-moat)). The prize is credited as an **encrypted winnings balance**, so the pool itself can't tell who won; only the winner decrypts a non-zero prize. Principal is **no-loss** — withdraw in full any time, clamped in FHE. And it's all **gasless** via 4337.

### 🔒 Confidential balances (ERC-7984)
**Problem.** ERC-20 balances are public — anyone can see what you hold and watch you move it.
**Solution.** Balances are **FHE ciphertexts** (ERC-7984). The chain, dApps, and observers see only ciphertext; **only you** can decrypt yours (EIP-712 user-decryption).

### ⚡ Gasless by default (ERC-4337 + paymaster)
**Problem.** Needing ETH for gas is the #1 onboarding blocker — judges and new users often have none.
**Solution.** Every account is a **4337 smart account**; a Pimlico **paymaster sponsors** every op, so the account pays **0**. The keyring EOA only signs (auto-approved EIP-712, no popup per step).

### 🌐 Shield / Unshield
**Problem.** Users need to move value between public ERC-20 and private ERC-7984 without exposing amounts.
**Solution.** One-tap **shield** (mint→approve→wrap, gasless) and **unshield** (encrypted burn → public-decrypt → finalize). This is also how the pool's deposit asset (cUSDC) is obtained.

### 👁 Delegated reveal
**Problem.** Your pool balance & winnings are held for the *smart account*, but you sign as the *EOA* — so the relayer won't let the EOA decrypt them.
**Solution.** The smart account delegates decrypt rights over the pool contract to your EOA on-chain (one gasless UserOp via the Zama ACL); then only you can reveal your balance and winnings.

---

## Confidentiality & leakage design

Confidentiality is a **design**, not a slogan. Stated plainly:

| Encrypted — never revealed on-chain | Public — documented, deliberate leakage |
|---|---|
| Every **deposit amount** (encrypted client-side before sending) | The **set of depositor addresses** that joined |
| Every **balance** and the **pool total** (`euint64`) | The **depositor count** (it's the draw loop length) |
| Each depositor's **odds / share** (derived from encrypted balances) | That a **deposit / withdraw / draw** happened, and **when** |
| The **prize amount** and the **winner's identity** | The pool's **existence and rules** (the contract is open) |

**Why this line?** Membership and timing are the minimum a permissionless on-chain pool must expose to function — the draw must loop over a known participant set, and events must fire for the UX. Every **monetary quantity** and the **winner selection** stay encrypted end to end. A production build could additionally hide the participant set behind stealth addresses or a shielded set; here it is left public for a legible demo (and so judges can watch the cycle happen). This mirrors the NatSpec in [`contracts/contracts/ConfidentialPrizePool.sol`](contracts/contracts/ConfidentialPrizePool.sol) — the contract is the source of truth.

---

## The weighted draw (the moat)

Picking a **deposit-weighted** winner over **encrypted** balances, without ever decrypting them and without encrypted division, is the hard part. The whole trick:

```
Let bal[i]   = depositor i's encrypted principal (euint64)
    prefix[i]= bal[0] + … + bal[i]         (encrypted running sum)
    total    = prefix[n-1]                 (encrypted pool total)

r      = FHE.randEuint64()                 // encrypted, uniform in [0, 2^64)
T      = FHE.asEuint128(r) * total128      // scaled ticket, < 2^128 (euint128 avoids overflow)

for each depositor i:
    prefix   = prefix + bal[i]
    threshold= prefix * 2^64
    crossed  = FHE.lt(T, threshold)        // has the ticket landed at/under bucket i?
    isWinner = FHE.and(crossed, notPrev)   // first crossing only (notPrev via select-complement)
    winnings[i] += FHE.select(isWinner, prize, 0)   // award lands as ciphertext
```

Depositor `i` wins iff `prefix[i-1]·2^64 ≤ T < prefix[i]·2^64`. Because `r/2^64` is uniform in `[0,1)`, the probability of landing in bucket `i` is exactly `bal[i]/total` — **deposit-weighted, exactly**, computed entirely on ciphertext with `mul` + `lt` + `and` + `select`. No `FHE.div`/`rem` by an encrypted value; `euint128` widening keeps `r · total < 2^128` so there's no overflow. Randomness never leaves the EVM, and the award is written encrypted, so **only the winner** sees a non-zero prize on decrypt.

---

## Yield source (mock)

In a no-loss pool, the **prize is the yield** on pooled principal. This build uses a **mock prize reserve**: the admin funds it by sending confidential tokens to the pool with `data == abi.encode(PRIZE_TAG)` (routed in `onConfidentialTransferReceived` → `_prizeReserve`). Each `draw()` awards the whole reserve to the winner and resets it.

A production integration would instead **accrue real yield** — deposit the pooled principal into a lending market (Aave-style) or an LST, and top up `_prizeReserve` from the earned yield — leaving the deposit, draw, claim, and withdraw logic **unchanged**. The mock is isolated behind that one funding path precisely so the yield source can be swapped without touching the confidential core.

---

## Supported Network & Contracts

**Sepolia testnet (chain ID 11155111)** only.

| Contract | Address |
|---|---|
| **ConfidentialPrizePool** | `0xD24FBf0F84C9f1AfCc63354498b8f1B3AF6f1067` |
| Confidential USDC (cUSDC, ERC-7984 — deposit asset) | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` |
| USDCMock (ERC-20 underlying — the faucet mints this) | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` |
| Zama ACL (delegation registry) | `0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6` |
| EntryPoint | v0.7 (via `abstractionkit`) |
| Paymaster + Bundler | Pimlico (ERC-7677) |

Pool config lives in `extension/core/pool.ts`. Other config (bundler/paymaster/RPC) comes from Vite env — see [Environment Notes](#environment-notes).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser Tab (dapp)                                              │
│  inpage.js (EIP-1193/6963) ── postMessage ── inject.js (content) │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ chrome.runtime
                                  ▼
┌────────────────────────────────────────────────────────────────┐
│  background.js (MV3 Service Worker)                             │
│  keyring (seed/pk) · crypto (PBKDF2 + AES-GCM) · message router │
│  eth_signTypedData_v4 → AUTO-APPROVED (keeps FHE/UserOp smooth) │
└────────────────────────────────────────────────────────────────┘
                     ▲  chrome.runtime.sendMessage
                     │
┌────────────────────┴───────────────────────────────────────────┐
│  index.html — Side Panel (React)                                │
│  ExtensionProviders → WagmiProvider → QueryClient → ZamaProvider│
│  App.tsx (HashRouter, default → /pool)                          │
│  ├── Prize Pool ★    (deposit / reveal / draw / claim / withdraw)│
│  ├── Dashboard       (public/shielded balances, reveal)         │
│  ├── Overview        (account + register view key)              │
│  ├── Shield/Unshield (ERC-7984 wrap/unwrap oracle flow)         │
│  ├── Spending Limits (grant hidden cap, decrypt policy)         │
│  ├── Send            (confidential transfer)                    │
│  └── Activity        (on-chain ops → Etherscan)                 │
│                                                                 │
│  4337 layer:  useSmartAccount → abstractionkit SafeAccountV0_3_0│
│               + Erc7677Paymaster (Pimlico)                      │
│  FHE layer:   @zama-fhe/react-sdk → src/zama/shim → UMD relayer │
└─────────────────────────────────────────────────────────────────┘
```

The EOA never pays gas: owner ops are gasless UserOps signed by the keyring (auto-approved EIP-712) and sponsored by the paymaster. FHE deposit inputs bind to the **cUSDC token** address (the `msg.sender` the token sees); withdraw inputs bind to the **pool** address.

---

## Project Structure

```
confidential-prize-pool/
├── README.md                    — this file (what judges read first)
├── .gitignore
│
├── contracts/                   — Hardhat project
│   ├── contracts/ConfidentialPrizePool.sol   ★ the FHE prize-pool contract
│   ├── test/ConfidentialPrizePool.test.ts    — 3 passing tests
│   ├── scripts/deploy-pool.ts                — Sepolia deploy
│   └── deployments/prize-pool.json           — live deployment (address + ABI)
│
└── extension/                   — the MV3 wallet (demo surface)
    ├── landing/index.html       — standalone marketing landing page
    ├── step.txt                 — the ~3-min demo script
    ├── public/manifest.json     — MV3 manifest (CSP: script-src 'self' 'wasm-unsafe-eval')
    ├── public/*.wasm + relayer-sdk-js.umd.cjs — bundled Zama FHE runtime (no CDN)
    ├── src/                      — extension glue (keyring, background, inpage/inject, FHE engine)
    │   ├── background.ts         — MV3 service worker: keyring + message router
    │   ├── chrome/               — keyring, crypto, rpc, inpage + inject provider
    │   └── zama/                 — FHE engine (UMD) + react-sdk shim + WagmiSigner
    ├── core/                     — chain logic (aliased @zhieldwrap/core)
    │   ├── pool.ts               ★ Prize Pool config: POOL_ADDRESS/ABI, cUSDC, PRIZE_TAG
    │   ├── aa.ts                 — 4337 config, REGISTRY, ABIs, ACL delegation, amount helpers
    │   └── abis/                 — ConfidentialPrizePool / ConfidentialToken / …
    └── web/                      — React UI (aliased @web)
        ├── App.tsx               — routes (default → /pool)
        ├── hooks/useSmartAccount.ts — 4337 smart account + gasless send
        └── pages/                — PrizePool ★, Dashboard, Overview, ShieldUnshield, Limits, Send, Activity, SpendAsKey
```

---

## Key Data Flows

### Deposit (confidential)
```
Deposit N cUSDC (one gasless UserOp, 3 inner calls)
  encrypt N against (cToken, smartAccount) → {handle, inputProof}   // amount never leaves in plaintext
  → approve(underlying, cToken, N)
  → wrap(cToken, smartAccount, N)                                   // mint N cUSDC to the smart account
  → confidentialTransferAndCall(cToken → pool, handle, proof, "0x") // pool credits _balance
```

### Delegated reveal (balance & winnings)
```
Enable private view (one gasless UserOp)
  → ACL.delegateForUserDecryption(delegate = EOA, contract = POOL_ADDRESS, expiry)
Reveal
  → useDecryptBalanceAs({ handles:[{handle, contractAddress: POOL_ADDRESS}], delegatorAddress: smartAccount })
    → keyring signs the EIP-712 permit (auto-approved) → relayer → plaintext (only you can)
```

### Draw → Claim
```
draw()  [owner/keeper, gasless]  → r = FHE.randEuint64(); loop encrypted prefix sums
  → winnings[winner] += FHE.select(isWinner, prize, 0)      // encrypted; only the winner decrypts a non-zero value
claim() [gasless] → confidentialTransfer(_winnings[msg.sender]) → reset 0   // others transfer 0, no leak
```

### Withdraw (no-loss)
```
withdraw(encAmount, proof)  [gasless]   encrypt N against (POOL_ADDRESS, smartAccount)
  → actual = FHE.select(FHE.ge(bal, requested), requested, bal)   // clamp; never over-withdraw, never revert-reveal
  → _balance -= actual; _total -= actual; confidentialTransfer(actual)
```

### Gasless UserOperation (every op)
```
useSmartAccount.sendTransactions([...])
  → ensureDeployed → createUserOperation → Erc7677Paymaster (Pimlico sponsorship)
  → keyring signs SafeOp EIP-712 (auto-approved) → bundler → included() → real tx hash + gas saved
```

---

## Security Model

| Concern | Implementation |
|---|---|
| Private key storage | PBKDF2 (600k) + AES-256-GCM in `chrome.storage.local`; decrypted material only in the service worker. Never reaches the UI or the page. |
| Signing | UserOp + FHE permits are EIP-712 signed by the keyring; auto-approved for the wallet's own side panel; external-dApp signing always prompts. |
| Gas | All ops are paymaster-sponsored — accounts hold no ETH (except a one-time owner deploy). |
| FHE ACL | Deposit inputs bind to cUSDC; withdraw inputs bind to the pool. Reveal requires an on-chain ACL delegation of the pool to the EOA. The pool grants `_balance`→depositor and `_winnings`→winner, so only they can decrypt. |
| No-loss | `withdraw` clamps with `FHE.select(ge(bal,req),req,bal)` — never withdraw more than principal, and the clamp never reverts (which would leak the balance). |
| Draw integrity | Randomness is `FHE.randEuint64` inside the EVM; the winner is computed on ciphertext and written encrypted — no offchain RNG, no operator can pick, no observer can read the outcome. |
| CSP | `script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'` — no CDN. Relayer SDK + TFHE/KMS WASM packaged in `public/`. |

---

## Quick start

**Contract**
```bash
cd contracts
npm install
npx hardhat test          # 3 prize-pool tests pass
# npx hardhat run scripts/deploy-pool.ts --network sepolia   # redeploy (needs .env)
```

**Wallet extension**
```bash
cd extension
pnpm install
cp .env.example .env      # fill in Sepolia RPC + Pimlico bundler/paymaster
pnpm build                # → extension/build/
```
Then: `chrome://extensions` → Developer mode → **Load unpacked** → `extension/build/` → open the wallet → **Prize Pool** tab. Follow [`extension/step.txt`](extension/step.txt) for the full cycle.

> `draw()` is **owner-only** — trigger it from the deploying account, or run a keeper. Copy `.env.example` → `.env` in each folder; **never commit `.env`** (both are gitignored).

---

## Environment Notes

`extension/.env` (gitignored) — Vite inlines `VITE_*` at build time (**static access only**; a dynamic key returns empty and disables every gasless button):

```
VITE_RPC_URL=…                 # Sepolia RPC
VITE_BUNDLER_URL=…             # Pimlico bundler (v2/11155111)
VITE_PAYMASTER_URL=…           # Pimlico paymaster (same URL)
VITE_SPONSORSHIP_POLICY_ID=…
VITE_SPENDING_LIMIT_MODULE=0x51eDE1d7cB232e8CCd516737f606bE9c61D2C488
```

`contracts/.env` (gitignored): `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`.

---

## Future Work

- **Real yield source** — swap the mock `_prizeReserve` for accrued yield from a lending market / LST on the pooled principal (draw/award logic unchanged).
- **Automated keeper** — a permissionless/time-gated `draw()` trigger instead of the owner-only call.
- **Hidden participant set** — stealth addresses or a shielded deposit set to remove the membership/count leakage.
- **Native account abstraction** — as native AA lands (e.g. EIP-8141), drop the external bundler/paymaster and validate + sponsor natively, confidential layer unchanged.
- **Mainnet relayer**, smart-account ↔ EOA toggle, and multi-asset pools.

---

## License

MIT
