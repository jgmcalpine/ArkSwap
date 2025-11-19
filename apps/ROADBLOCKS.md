# 🚧 Project Roadblocks & Technical Retrospective

This document outlines the specific technical challenges encountered during the initial development of **ArkSwap**. It serves as a guide for future contributors to understand the architectural decisions and avoid common pitfalls in Bitcoin/Next.js development.

---

## 1. Cryptography & WebAssembly (The "Hydration Hell")

### The Problem
The application crashed on startup with `TypeError: ecc.isPoint is not a function` and `Hydration failed`. The screen would go blank with no UI feedback.

### The Root Cause
We initially used `tiny-secp256k1`, which relies on **WebAssembly (WASM)**.
1.  **Next.js App Router Limitation:** Next.js components (even Client Components) are pre-rendered on the server. WASM modules are inherently **asynchronous** (`await import(...)`), but React's initial render pass expects synchronous execution.
2.  **Module Interop:** The WASM loader in Webpack often creates friction between CommonJS and ESM imports, leading to the library exporting as `{ default: Module }` instead of `Module`, causing functions to be `undefined`.
3.  **Shared Library Infection:** Even when we fixed the Frontend, the build failed because the **Shared Protocol Package** (`@arkswap/protocol`) still depended on the WASM library. Next.js attempts to bundle shared dependencies and choked on the WASM binary inside the protocol package.

### The Solution
**The "Nuclear Fix":** We abandoned WASM entirely for the UI layer.
*   **Action:** Switched from `tiny-secp256k1` to **`@bitcoinerlab/secp256k1`**.
*   **Why:** This library uses `noble-curves` (Pure JavaScript). It requires no async loading, no special Webpack config, and works identically on Server and Client.
*   **Lesson:** When building Next.js dApps, avoid async WASM libraries unless absolutely necessary. Prefer Pure JS implementations for simpler build stability.

---

## 2. Protocol Security (The "Insecure Key Path")

### The Problem
The initial draft of the Taproot HTLC script (`createSwapLock`) was cryptographically insecure.

### The Root Cause
We initially derived the Taproot **Internal Key** deterministically from public parameters (`MakerPubkey + UserPubkey`).
*   **The Exploit:** Taproot allows spending via the **Script Path** (HTLC) OR the **Key Path** (Internal Key). If the Internal Key is derived from public data, an attacker (or miner) could reconstruct the private key and spend the funds via the Key Path, bypassing the HTLC logic entirely.
*   **Secondary Issue:** We manually constructed Control Blocks with a hardcoded Parity Bit (`0xc0`), which would cause valid signatures to fail verification 50% of the time (depending on Y-coordinate parity).

### The Solution
1.  **NUMS Point:** We switched to using a standard **Nothing Up My Sleeve (NUMS)** point (`H_POINT`) as the Internal Key. This disables Key Path spending entirely, forcing users to use the HTLC scripts.
2.  **Library Delegation:** We stopped manually concatenating buffers and used `bitcoin.payments.p2tr({ redeem: ... })`. This delegates the complex Parity Bit and Merkle Proof calculation to `bitcoinjs-lib`, ensuring correctness.

---

## 3. Bitcoin Core Infrastructure (The "Modern Defaults")

### The Problem
Our Docker scripts (`mine.sh`) failed with "Method not found" or "Wallet not found" errors, even though the container was running.

### The Root Cause
1.  **Missing Authentication:** `curl` requests to Bitcoin Core require Basic Auth (`--user user:pass`). Without it, the node rejects connections silently or with 401 errors.
2.  **No Default Wallet:** Modern versions of Bitcoin Core (v24+) do **not** create a default wallet on startup. Calls to `getnewaddress` fail immediately because there is no wallet file to store the key.

### The Solution
1.  **Strict Auth:** All scripts now enforce `RPC_USER` and `RPC_PASS`.
2.  **Defensive Scripting:** The mining script now attempts to call `createwallet` *before* generating an address. This makes the setup idempotent (works on first run and subsequent runs).

---

## 4. Tooling & Monorepo (The "Bleeding Edge" Pain)

### The Problem
`pnpm turbo build` failed immediately upon project initialization.

### The Root Cause
1.  **Corepack Signatures:** Node.js v22.11.0 ships with outdated Corepack keys, causing it to reject the `pnpm` binary signature.
2.  **TurboRepo v2 Migration:** We used a `turbo.json` schema from v1 (`pipeline`), but installed Turbo v2, which expects the key `tasks`.

### The Solution
1.  **Bypass Corepack:** We manually specified the `packageManager` version in `package.json` and installed `pnpm` globally via npm to bypass the signature check.
2.  **Schema Update:** We updated `turbo.json` to use the modern `tasks` configuration.

---

## 5. State Management (The "Infinite Loop")

### The Problem
The Wallet UI showed the user as "Connected" immediately upon page load, even after disconnecting.

### The Root Cause
The `getAddress()` method in our client had a side effect.
*   **Logic:** "If no key exists, create one."
*   **Result:** The app checked "Is there a wallet?" -> The client said "No, so I made one. Yes." -> The app connected.

### The Solution
**Separation of Concerns:**
*   `getAddress()` was refactored to return `string | null` (Read-only).
*   `createWallet()` was kept separate (Write).
*   This ensures the app only connects when the user explicitly performs an action or has a previously persisted session.

## 6. Bitcoin Core RPC (The "Fee Estimation" Trap)

### The Problem
The Backend crashed with a 500 Internal Server Error when attempting to broadcast the L1 payout transaction.
`Log Error: Raw Bitcoin RPC Error: Fee estimation failed. Fallbackfee is disabled.`

### The Root Cause
Bitcoin Core tries to calculate "Smart Fees" based on recent network activity to ensure transactions confirm quickly.

- Regtest Isolation: On a local Regtest network, there is often zero transaction history or mempool congestion.
- The Safety Lock: Because the node has no data to estimate a fee, it refuses to send the transaction to prevent it from getting stuck with an accidentally low fee. It requires an explicit fallback value to override this safety check.

### The Solution
We updated the `docker-compose.yml` command for `bitcoind` to include:
`-fallbackfee=0.0002`
This tells the node: "If you don't know what fee to use, just use 20,000 sats/kB."
