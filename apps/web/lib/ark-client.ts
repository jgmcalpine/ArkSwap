import { walletTools } from './crypto';
import type { Vtxo, ArkTransaction, ArkInput, ArkOutput, Address, TxId } from '@arkswap/protocol';
import { getTxHash, VtxoSchema, asTxId, asAddress, asSignatureHex } from '@arkswap/protocol';
import { z } from 'zod';

const WIF_STORAGE_KEY = 'ark_wallet_wif';
const VTXO_STORAGE_KEY = 'ark_vtxos';

export class MockArkClient {
  /**
   * EMPTY CONSTRUCTOR - Do not load keys, do not access localStorage, do not call crypto.
   * All initialization happens lazily in methods.
   */
  constructor() {
    // Intentionally empty - no side effects
  }

  /**
   * Helper to read VTXOs from LocalStorage (only called from methods)
   */
  private getStorage(): Record<string, Vtxo[]> {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(VTXO_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Failed to parse ark vtxos", e);
      return {};
    }
  }

  /**
   * Helper to save VTXOs to LocalStorage (only called from methods)
   */
  private setStorage(vtxos: Record<string, Vtxo[]>) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(VTXO_STORAGE_KEY, JSON.stringify(vtxos));
  }

  /**
   * Gets the stored WIF from localStorage (only called from methods)
   */
  private getWIF(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(WIF_STORAGE_KEY);
  }

  /**
   * Stores the WIF in localStorage (only called from methods)
   */
  private setWIF(wif: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(WIF_STORAGE_KEY, wif);
  }

  /**
   * Gets the keypair from stored WIF or creates a new one
   */
  private async getKeyPair() {
    const { ECPair, network } = walletTools;
    const wif = this.getWIF();
    if (wif) {
      return ECPair.fromWIF(wif, network);
    }
    const keyPair = ECPair.makeRandom({ network });
    this.setWIF(keyPair.toWIF());
    return keyPair;
  }

  /**
   * Creates a new wallet with a real Bitcoin keypair and returns the Taproot address
   */
  async createWallet(): Promise<string> {
    // Ensure keypair exists first
    await this.getKeyPair();
    const address = await this.getAddress();
    
    if (!address) {
      throw new Error('Failed to generate address after creating wallet');
    }
    
    return address;
  }

  /**
   * Returns the Taproot address derived from the stored key, or null if no wallet exists
   */
  async getAddress(): Promise<string | null> { // Return type changed to allow null
    const { bitcoin, network } = walletTools;
    
    // 1. Check WIF directly first. Do not call getKeyPair() yet.
    const wif = this.getWIF();
    if (!wif) {
      return null; // No wallet exists
    }

    // 2. Now safe to get keypair
    const keyPair = await this.getKeyPair();
    const payment = bitcoin.payments.p2tr({
      internalPubkey: keyPair.publicKey.slice(1, 33),
      network,
    });
    
    return payment.address!;
  }

  /**
   * Returns the 32-byte x-only public key Buffer
   */
  async getPublicKey(): Promise<Buffer> {
    const keyPair = await this.getKeyPair();
    return keyPair.publicKey.slice(1, 33); // x-only pubkey (32 bytes)
  }

  /**
   * Signs a hash (stub for Chunk 8)
   */
  async sign(hash: Buffer): Promise<Buffer> {
    // TODO: Implement in Chunk 8
    throw new Error('sign() not yet implemented');
  }

  /**
   * Gets the balance for an address by summing unspent VTXOs
   */
  getBalance(address: string): number {
    const vtxos = this.getStorage();
    const addressBranded = asAddress(address);
    const addressVtxos = vtxos[address] ?? [];
    return addressVtxos
      .filter(vtxo => !vtxo.spent && vtxo.address === addressBranded)
      .reduce((sum, vtxo) => sum + vtxo.amount, 0);
  }

  /**
   * Gets all unspent VTXOs for an address
   */
  getVtxos(address: string): Vtxo[] {
    const vtxos = this.getStorage();
    const addressBranded = asAddress(address);
    const addressVtxos = vtxos[address] ?? [];
    return addressVtxos.filter(vtxo => !vtxo.spent && vtxo.address === addressBranded);
  }

  /**
   * Adds a new VTXO for an address (used by faucet)
   */
  addVtxo(address: string, amount: number): void {
    const vtxos = this.getStorage();
    const addressVtxos = vtxos[address] ?? [];
    
    // Generate a random txid (64 hex characters)
    const txid = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    const newVtxo: Vtxo = {
      txid: asTxId(txid),
      vout: 0,
      amount,
      address: asAddress(address),
      spent: false,
    };
    
    addressVtxos.push(newVtxo);
    vtxos[address] = addressVtxos;
    this.setStorage(vtxos);
  }

  /**
   * Selects coins using First Fit algorithm
   * Returns an array of VTXOs that sum to at least the target amount
   */
  selectCoins(address: string, targetAmount: number): Vtxo[] {
    const unspentVtxos = this.getVtxos(address);
    const addressBranded = asAddress(address);
    
    // SECURITY FIX: Ensure we only select coins that match the current address
    // This prevents trying to sign coins from a previous wallet session
    const myCoins = unspentVtxos.filter(v => v.address === addressBranded);
    
    // Sort by amount descending for better selection
    const sorted = [...myCoins].sort((a, b) => b.amount - a.amount);
    
    let selected: Vtxo[] = [];
    let total = 0;
    
    for (const vtxo of sorted) {
      if (total >= targetAmount) break;
      selected.push(vtxo);
      total += vtxo.amount;
    }
    
    return selected;
  }

  /**
   * Marks VTXOs as spent
   */
  markVtxosSpent(address: string, txids: TxId[]): void {
    const vtxos = this.getStorage();
    const addressVtxos = vtxos[address] ?? [];
    
    for (const vtxo of addressVtxos) {
      if (txids.includes(vtxo.txid)) {
        vtxo.spent = true;
      }
    }
    
    vtxos[address] = addressVtxos;
    this.setStorage(vtxos);
  }

  /**
   * Legacy method for backward compatibility - now uses addVtxo
   */
  addBalance(address: string, amount: number): void {
    if (amount > 0) {
      this.addVtxo(address, amount);
    } else {
      // For negative amounts, we need to mark VTXOs as spent
      // This is a simplified approach - in practice, you'd select specific coins
      const targetAmount = Math.abs(amount);
      const selected = this.selectCoins(address, targetAmount);
      const txids: TxId[] = selected.map(v => v.txid);
      this.markVtxosSpent(address, txids);
    }
  }

  /**
   * Simulates an employer payment (renamed from faucet)
   */
  simulateEmployerPayment(address: string, amount: number): void {
    this.addVtxo(address, amount);
  }

  /**
   * Initiates a lift (onboarding) request to the ASP
   */
  async lift(address: string, amount: number): Promise<{ status: string; nextRound: string }> {
    const LiftResponseSchema = z.object({
      status: z.string(),
      nextRound: z.string(),
    });

    const response = await fetch('http://localhost:7070/v1/lift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount }),
    });

    if (!response.ok) {
      throw new Error(`Lift request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return LiftResponseSchema.parse(data);
  }

  /**
   * Fetches VTXOs from the ASP and merges them into local storage
   */
  async fetchFromASP(address: string): Promise<void> {
    try {
      const response = await fetch(`http://localhost:7070/v1/vtxos/${address}`);
      
      if (!response.ok) {
        // If ASP is not available, silently fail (don't break the app)
        if (response.status === 404 || response.status >= 500) {
          return;
        }
        throw new Error(`Failed to fetch VTXOs: ${response.statusText}`);
      }

      const data = await response.json();
      const aspVtxos = VtxoSchema.array().parse(data);
      const vtxos = this.getStorage();
      const addressVtxos = vtxos[address] ?? [];
      
      // Merge logic: check if we already have each VTXO by txid
      let hasNewVtxos = false;
      for (const aspVtxo of aspVtxos) {
        const exists = addressVtxos.some(v => v.txid === aspVtxo.txid);
        if (!exists) {
          addressVtxos.push(aspVtxo);
          hasNewVtxos = true;
        }
      }
      
      // Only save if we have new VTXOs
      if (hasNewVtxos) {
        vtxos[address] = addressVtxos;
        this.setStorage(vtxos);
      }
    } catch (error) {
      // Silently fail if ASP is not available
      console.error('Failed to fetch from ASP:', error);
    }
  }

  /**
   * Sends tokens to another address
   * Returns the transferId (L2 transaction hash)
   */
  async send(amount: number, toAddress: string): Promise<string> {
    const { bitcoin, ECPair, network } = walletTools;
    const keyPair = await this.getKeyPair();
    const myAddress = await this.getAddress();
    
    if (!myAddress) {
      throw new Error('No wallet found. Please create a wallet first.');
    }

    // 1. Select Coins (With Address Filter for safety)
    const selected = this.selectCoins(myAddress, amount);
    if (selected.length === 0) {
      throw new Error('Insufficient funds');
    }

    const selectedTotal = selected.reduce((sum, v) => sum + v.amount, 0);
    if (selectedTotal < amount) {
      throw new Error(`Insufficient funds: ${selectedTotal} < ${amount}`);
    }

    const change = selectedTotal - amount;

    // 2. Build Outputs
    const outputs: ArkOutput[] = [
      { address: asAddress(toAddress), amount },
    ];

    if (change > 0) {
      outputs.push({ address: asAddress(myAddress), amount: change });
    }

    // 3. Prepare Inputs
    const inputsUnsigned = selected.map(coin => ({
      txid: coin.txid,
      vout: coin.vout,
    }));

    // 4. Calculate Hash
    const txHashHex = await getTxHash(inputsUnsigned, outputs);
    const txHashBuffer = Buffer.from(txHashHex, 'hex');

    // --- BIP-86 SIGNING LOGIC START ---

    // 1. Prepare the Private Key Buffer (32 bytes)
    if (!keyPair.privateKey) throw new Error('Missing private key');
    let privateKeyBuffer = keyPair.privateKey.length === 33 
      ? keyPair.privateKey.slice(1) 
      : keyPair.privateKey;

    // 2. Handle Key Parity (Critical for Taproot)
    // If the public key has an ODD Y-coordinate (prefix 0x03), 
    // we must negate the private key before tweaking to match the x-only pubkey expectation.
    if (keyPair.publicKey[0] === 0x03) {
      privateKeyBuffer = Buffer.from(walletTools.ecc.privateNegate(privateKeyBuffer));
    }

    // 3. Get x-only Pubkey
    const internalPubkey = keyPair.publicKey.slice(1, 33);

    // 4. Calculate Tweak
    const tweakHash = bitcoin.crypto.taggedHash('TapTweak', internalPubkey);

    // 5. Apply Tweak
    const tweakedPrivateKey = walletTools.ecc.privateAdd(privateKeyBuffer, tweakHash);
    if (!tweakedPrivateKey) throw new Error('Failed to tweak private key');

    // --- BIP-86 SIGNING LOGIC END ---

    // Create tweaked keypair for validation (needed for proper key format)
    const tweakedKeyPair = ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), { network });

    // 5. Sign Inputs
    const inputs: ArkInput[] = selected.map((coin) => {
      // Sign using the TWEAKED private key
      const signatureRaw = walletTools.ecc.signSchnorr(txHashBuffer, tweakedPrivateKey);
      const signatureHex = Buffer.from(signatureRaw).toString('hex');
      
      return {
        txid: coin.txid,
        vout: coin.vout,
        signature: asSignatureHex(signatureHex),
      };
    });

    const tx: ArkTransaction = { inputs, outputs };

    // 6. Broadcast
    const response = await fetch('http://localhost:7070/v1/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(err.error || err.message || 'Transfer failed');
    }

    const result = await response.json();

    // 7. Update State
    const allVtxos = this.getStorage();
    if (allVtxos[myAddress]) {
      allVtxos[myAddress] = allVtxos[myAddress].map(v => {
        if (selected.find(s => s.txid === v.txid && s.vout === v.vout)) {
          return { ...v, spent: true };
        }
        return v;
      });
      this.setStorage(allVtxos);
    }

    return result.transferId || result.txid;
  }

  /**
   * Claims a refund by lifting funds back to L2
   * Uses the Lift mechanism to ensure the ASP knows about the VTXO
   */
  async claimRefund(amount: number, address: string): Promise<{ status: string; nextRound: string }> {
    // Use lift to recover L1 funds and re-deposit them to L2
    // This ensures the ASP generates the VTXO and knows the ID
    return await this.lift(address, amount);
  }

  /**
   * Clears all wallet data from localStorage (WIF and VTXOs)
   * Used when disconnecting a wallet
   */
  clearWallet(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(WIF_STORAGE_KEY);
    localStorage.removeItem(VTXO_STORAGE_KEY);
  }
}

// Export a singleton instance (constructor is empty, so this is safe)
export const mockArkClient = new MockArkClient();
