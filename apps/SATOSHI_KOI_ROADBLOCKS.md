# 🐠 SatoshiKoi: Engineering Challenges & Protocol Solutions

This document details the specific architectural and cryptographic hurdles encountered while building **SatoshiKoi** (The Ark Assets Reference Implementation). It serves as a technical log of the "Zero to One" engineering decisions required to enable stateful assets on Bitcoin Layer 2.

---

## 1. Multi-Layer Key Derivation (The "Double Tweak")

### The Challenge
When implementing the "Show Off" feature (entering the Pond), the ASP repeatedly rejected valid Schnorr signatures with `Invalid Signature`, despite the client successfully signing messages for standard VTXOs.

### The Root Cause (Cryptography)
Standard Ark VTXOs use **BIP-86** (Key Spending Path) where the address is derived from `Pubkey + Hash(TapTweak)`.
However, **Asset VTXOs** introduce an additional layer of binding. The address is derived from `(Pubkey + Hash(AssetMetadata)) + Hash(TapTweak)`.
The Client was attempting to sign using only the standard BIP-86 tweak, missing the intermediate "Asset Tweak."

### The Engineering Solution
We implemented a recursive key derivation pipeline in `ark-client.ts`:
1.  **Base Layer:** Negate the private key if the Y-coordinate is odd (0x03).
2.  **Asset Layer:** Calculate `tweak = SHA256(CanonicalJSON(Metadata))`. Perform Elliptic Curve addition (`privKey.add(tweak)`).
3.  **Taproot Layer:** Check the parity of the *new* intermediate key. Negate again if necessary. Apply the final BIP-86 TapTweak.
4.  **Sign:** Perform raw Schnorr signing with the doubly-modified scalar.

---

## 2. The Genesis Discovery Paradox

### The Challenge
Upon clicking "Mint Gen 0," the backend logs confirmed the VTXO was created, but the Frontend Wallet never detected the new asset, leaving the user with a "stuck" loading state.

### The Root Cause (Distributed State)
This was a race condition in knowledge.
1.  **The Protocol:** The Asset VTXO's address is mathematically determined by its DNA.
2.  **The Conflict:** The ASP generates the DNA server-side during minting. The Client polls for VTXOs at the User's *Base Address*.
3.  **The Result:** The VTXO existed at a *derived* address that the Client didn't know existed yet.

### The Engineering Solution
We architected a **Predictive Discovery Flow**:
1.  The ASP returns the generated Metadata *immediately* in the API response, before the Ark Round finalizes.
2.  The Client takes this Metadata, runs the `createAssetLock` protocol function locally, and derives the specific **Target Address**.
3.  The Client adds this target address to a dynamic `WatchedAddresses` array in `localStorage`, allowing the polling engine to scan multiple derivation paths simultaneously.

---

## 3. Deterministic Asset Identity

### The Challenge
We needed to generate a unique `AssetID` (Hash) that persists across the network. However, hashing JSON objects is non-deterministic; `{ "gen": 0, "dna": "abc" }` produces a different hash than `{ "dna": "abc", "gen": 0 }`.

### The Root Cause (Serialization)
JavaScript runtimes do not guarantee key order in object serialization. If the Client and Server serialized the metadata differently, they would derive different addresses, effectively sending funds to a "black hole" that no private key could open.

### The Engineering Solution
We enforced **Canonical Serialization** at the protocol level.
*   We integrated `fast-json-stable-stringify` into the shared `packages/protocol` library.
*   We wrote unit tests verifying that nested objects and optional fields (`parents: []` vs `parents: undefined`) produce bit-perfect hash matches across environments.
*   This ensures that `getAssetHash(metadata)` is mathematically rigorous, preventing loss of funds due to JSON formatting.

---

## 4. Polymorphic VTXO Management

### The Challenge
Introducing Assets threatened to break the core `ArkSwap` functionality. The Wallet's `selectCoins` algorithm (used for swapping to L1) is "Asset-Blind"—it simply looks for satoshis.

### The Root Cause (Coin Control)
Without intervention, the wallet would treat a "Legendary Void Koi" (worth 1,000 sats) as identical to a "Dust UTXO" (worth 1,000 sats). A user attempting to pay a 500 sat fee could accidentally burn their rarest asset.

### The Engineering Solution
We implemented **Strict Coin Control** at the state management level:
1.  **Type Guards:** Extended the `Vtxo` interface to `AssetVtxo` using discriminated unions based on the presence of `metadata`.
2.  **Segregated Selection:**
    *   `selectCoins()` (Payment): Explicitly filters `vtxo.metadata === undefined`.
    *   `selectAsset()` (Game): Targets specific TxIDs.
3.  **Visual Feedback:** Updated the UI to visually distinguish "Money" (Stack of Coins icon) from "Assets" (Fish icon), giving the user confidence that their collectibles are safe from automated fee selection.

## 5. Breeding Signatures (The Identity Mismatch)

### The Challenge
The `breed` endpoint rejected signatures with `Invalid Schnorr signature`.

### The Root Cause
The Client was attempting to sign the breeding request using the complex "Double Tweak" logic (used for *moving* assets). However, the Breeding endpoint verifies ownership by deriving the asset addresses from the User's **Base Identity** (Pubkey). It expected a simple signature from the wallet's root key, not the derived asset key.

### The Solution
We simplified the signing logic for the `breed()` method in `ark-client.ts` to use the **Base Private Key** (with only the standard 0x03 parity check), matching the ASP's expectation that "The owner of the Wallet authorizes the breeding of these two fish."

---

## 6. Client-Side Validation (The Trustless Seal)

### The Challenge
We needed to prove that the ASP wasn't rigging the RNG to hoard Legendary fish for itself or nerf user outcomes.

### The Solution
We implemented a **Verify-on-Arrival** system:
1.  **Entropy Commitment:** The ASP includes the random `entropy` used for breeding in the Child's metadata.
2.  **Local Replay:** When the Wallet receives a new Child VTXO, it fetches the DNA of both Parents from `localStorage`.
3.  **Deterministic Check:** The Client runs the shared `mixGenomes` function locally using (ParentA, ParentB, ServerEntropy).
4.  **The Badge:** If `LocalResult === ServerResult`, the UI displays a green "Verified Genetics" shield. If not, it flags the asset as fraudulent. This forces the server to be honest.