# ArkSwap

**A Trustless Liquidity Bridge for the Ark Protocol.**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6.svg)
![Stack](https://img.shields.io/badge/stack-Next.js%20|%20NestJS%20|%20Docker-000000.svg)
![Status](https://img.shields.io/badge/status-PoC%20(In%20Development)-orange.svg)

## 🌊 Overview

**ArkSwap** is a non-custodial application allowing users to atomically swap **Ark Layer 2 VTXOs** for **Bitcoin Layer 1** funds.

As the "Sovereign Earner" economy grows, users earning on Layer 2 need a way to move funds to cold storage (Layer 1) without centralized exchanges (KYC) or complex Lightning channel management. ArkSwap fills this gap using **Taproot HTLCs** (Hash Time-Locked Contracts) to ensure that swaps are mathematically atomic: either the user gets their Bitcoin, or they reclaim their Ark funds.

**Key Differentiators:**
*   **Trustless:** No custodial risk. If the service fails, the protocol enforces a refund.
*   **Atomic:** Swaps execute completely or not at all.
*   **Privacy-Preserving:** Leverages Ark's native CoinJoin structure to break links between payer and saver.

## 🛠 Tech Stack

This project is organized as a **TurboRepo** monorepo.

*   **Apps:**
    *   `apps/web`: **Next.js 14** (App Router) - The user interface and client-side wallet.
    *   `apps/api`: **NestJS** - The Market Maker backend that manages liquidity and watches the chain.
*   **Packages:**
    *   `packages/protocol`: Shared **TypeScript** library containing the core Bitcoin/Ark cryptographic logic (HTLC scripts, validation).
*   **Infrastructure:**
    *   **Docker:** Orchestrates a local "Universe" containing Bitcoin Core (Regtest), Postgres, and Redis.

## 🚀 Getting Started

Follow these steps to run the entire ArkSwap ecosystem locally.

### Prerequisites
*   **Node.js** (v18+) & **pnpm**
*   **Docker Desktop** (Running)

### 1. Installation
Clone the repo and install dependencies.
```bash
git clone https://github.com/your-org/arkswap.git
cd arkswap
pnpm install
```

### 2. Start the Infrastructure (The Universe)
Spin up the local Bitcoin Regtest node and databases.
```bash
cd docker
docker-compose up -d
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
- [ ] **Phase 11: VTXO State Management** (Implement real Ark Wallet SDK)
- [ ] **Phase 12: The "Lift" - Onboarding** (Lift bitcoin onto the Ark)
- [ ] **Phase 13: The "Off-Chain" HTLC Funding** (Final Boss)
- [ ] **Phase 14: The Double Unilateral Exit** (Implement the Ark exit)

## 🤝 Contributing

We welcome contributions! Please note that this project deals with financial cryptography.
1.  **Strict Types:** We use TypeScript strict mode. No `any`.
2.  **Shared Logic:** All cryptographic logic belongs in `packages/protocol`, not in the apps.
3.  **Testing:** Any changes to `packages/protocol` must pass `pnpm test` with 100% coverage.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.