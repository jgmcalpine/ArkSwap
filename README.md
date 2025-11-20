# ArkSwap

**The Reference Implementation for Programmable Ark Transactions.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6.svg)
![Stack](https://img.shields.io/badge/stack-Next.js%20|%20NestJS%20|%20Docker-000000.svg)
![Status](https://img.shields.io/badge/status-PoC%20(Functional)-green.svg)

## 🌊 Overview

**ArkSwap** is a non-custodial liquidity bridge that demonstrates the programmable nature of the **Ark Layer 2 Protocol**. It allows users to atomically swap **Ark VTXOs** for **Bitcoin Layer 1** funds without trusting the service provider.

Unlike standard Ark wallets that only perform simple transfers, ArkSwap acts as a proof-of-concept for **Off-Chain Programmability**. It demonstrates how an Ark Service Provider (ASP) can accept a VTXO transfer encumbered by a custom **Taproot HTLC** (Hash Time-Locked Contract), enabling complex DeFi primitives to exist natively within the Ark protocol rounds.

**Key Differentiators:**
*   **Programmable L2:** Demonstrates VTXO transfers into custom Taproot scripts (not just P2PK).
*   **Trustless:** Swaps are secured by mathematical timelocks. If the Market Maker fails to pay, the protocol enforces a refund.
*   **Atomic:** The off-chain VTXO transfer and the on-chain L1 settlement are cryptographically linked.
*   **Privacy-Preserving:** Leverages Ark's native CoinJoin structure to break links between the payer and the savings destination.

## 🛠 Tech Stack

This project is organized as a **TurboRepo** monorepo representing a complete L2 ecosystem.

*   **Apps:**
    *   `apps/web`: **Next.js 14** - The client-side **Ark Wallet**. Manages VTXO state, performs Coin Selection, and constructs BIP-86 Taproot signatures.
    *   `apps/asp`: **NestJS** - A custom, lightweight **Ark Service Provider**. It coordinates rounds, manages the VTXO set, and validates programmable transfers.
    *   `apps/api`: **NestJS** - The **Market Maker** backend. It quotes swaps, watches the ASP for locked funds, and broadcasts L1 Bitcoin transactions.
*   **Packages:**
    *   `packages/protocol`: Shared **TypeScript** library containing the core Bitcoin/Ark cryptographic logic (HTLC scripts, deterministic hashing, witness construction).
*   **Infrastructure:**
    *   **Docker:** Orchestrates the local "Universe": Bitcoin Core (Regtest), ASP, Postgres, and Redis.

## 🚀 Getting Started

Follow these steps to run the entire ArkSwap ecosystem locally.

### Prerequisites
*   **Node.js** (v18+) & **pnpm**
*   **Docker Desktop** (Running)

### 1. Installation
Clone the repo and install dependencies.
```bash
git clone https://github.com/jgmcalpine/arkswap.git
cd arkswap
pnpm install
```

### 2. Start the Infrastructure (The Universe)
Spin up the local Bitcoin Regtest node and Ark Service Provider (ASP).
```bash
cd docker
docker-compose up -d --build
```

### 3. Run the Development Servers
Start the Frontend (`localhost:3000`) and Backend (`localhost:3001`).
```bash
# From the root directory
pnpm dev
```

### 4. "God Mode" (Funding & Simulation)
Since this runs on Regtest, you control the blockchain. We provide scripts to mine blocks and fund wallets.

**Check Blockchain Status:**
```bash
./scripts/get-info.sh
```

**Mine Blocks (Time Travel):**
```bash
# Mines 101 blocks to mature coinbase rewards
./scripts/mine.sh 101
```

**Fund the Market Maker:**
```bash
# Sends 50 BTC to the Backend API wallet
curl -X POST http://localhost:3001/faucet/maker
```

## 🗺 Roadmap & Progress

We are building ArkSwap in distinct "Chunks" to ensure security and architectural soundness.

- [x] **Phase 1: Scaffolding** (Monorepo setup, Docker environment)
- [x] **Phase 2: Infrastructure** (Bitcoin Regtest, Postgres, Redis connectivity)
- [x] **Phase 3: Backend Connectivity** (NestJS <-> Bitcoin RPC connection)
- [x] **Phase 4: Frontend Wallet** (Local non-custodial wallet, state persistence)
- [x] **Phase 5: God Mode** (Faucets, Mining simulation, DevTools)
- [x] **Phase 6: The Protocol** (Taproot HTLC Script implementation & 100% test coverage)
- [x] **Phase 7: The Handshake** (Quote generation & Cryptographic negotiation)
- [x] **Phase 8: Execution** (Happy Path: Locking funds & Claiming L1 Bitcoin)
- [x] **Phase 9: The Safety Net** (Unhappy Path: Unilateral Exit/Refund flow)
- [x] **Phase 10: Infrastructure - The Real ASP** (Build minimal Ark Service Provider)
- [x] **Phase 11: VTXO State Management** (Implement real Ark Wallet SDK)
- [x] **Phase 12: The "Lift" - Onboarding** (Lift bitcoin onto the Ark)
- [x] **Phase 13: The "Off-Chain" HTLC Funding** (Spending VTXOs into HTLCs off-chain)
- [ ] **Phase 14: The Double Unilateral Exit** (L2 -> L1 protocol exit)

## 🔮 Out of Scope / Future Improvements

While ArkSwap demonstrates the logic of the protocol, a production deployment would require replacing several simulated components with robust infrastructure.

### 1. Atomic Lifting (Trustless Onboarding)
**Current State**: We simulate the "Lifting" process via a direct API call. The ASP simply credits the user with a VTXO.

**Production Requirement**: Users must construct and broadcast a Bitcoin L1 transaction that funds the Ark Covenant directly. The act of funding on-chain forces the creation of the VTXO off-chain, removing the need to trust the ASP.

### 2. On-Chain Round Settlement
**Current State**: Our custom ASP "finalizes" rounds in memory. It checks signatures and updates the local VTXO ledger, but it does not broadcast a transaction to Bitcoin L1.

**Production Requirement**: The core security of Ark relies on the ASP aggregating all off-chain transfers into a single, massive Bitcoin transaction (The Round Tx) and broadcasting it to the mainnet. VTXOs are only truly valid once that Round Tx is confirmed or in the mempool.

### 3. Covenant Enforcement (Connectors)
**Current State**: We validate VTXO ownership using TypeScript logic (transfer.service.ts).

**Production Requirement**: Real Ark VTXOs are secured by Covenants (complex trees of pre-signed Bitcoin transactions). The ASP must enforce these rules cryptographically by ensuring every VTXO output is logically connected to the previous Round Tx via shared UTXO connectors.

### 4. Secure Key Storage
**Current State**: Private keys are stored in the browser's localStorage. This is acceptable for Regtest "play money" but dangerous for real funds.

**Production Requirement**: Integration with a dedicated Bitcoin Browser Extension (like Alby or a native Ark extension) or Hardware Wallet (Ledger/Trezor). The web app should request signatures, never access raw private keys.

### 5. Persistence & Crash Recovery
**Current State**: The ASP and Market Maker store active swaps and VTXO sets in Memory. If the Docker container restarts, the state is lost.

**Production Requirement**: All state must be persisted to the PostgreSQL database (which is currently scaffolded but under-utilized) to ensure users don't lose funds during server maintenance.

## 🤝 Contributing

We welcome contributions! Please note that this project deals with financial cryptography.
1.  **Strict Types:** We use TypeScript strict mode. No `any`.
2.  **Shared Logic:** All cryptographic logic belongs in `packages/protocol`, not in the apps.
3.  **Testing:** Any changes to `packages/protocol` must pass `pnpm test` with 100% coverage.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.