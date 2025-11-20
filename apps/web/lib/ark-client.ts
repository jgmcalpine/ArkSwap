import { walletTools } from './crypto';
import type { Vtxo } from '@arkswap/protocol';

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
    const addressVtxos = vtxos[address] ?? [];
    return addressVtxos
      .filter(vtxo => !vtxo.spent)
      .reduce((sum, vtxo) => sum + vtxo.amount, 0);
  }

  /**
   * Gets all unspent VTXOs for an address
   */
  getVtxos(address: string): Vtxo[] {
    const vtxos = this.getStorage();
    const addressVtxos = vtxos[address] ?? [];
    return addressVtxos.filter(vtxo => !vtxo.spent);
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
      txid,
      vout: 0,
      amount,
      address,
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
    
    // Sort by amount descending for better selection
    const sorted = [...unspentVtxos].sort((a, b) => b.amount - a.amount);
    
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
  markVtxosSpent(address: string, txids: string[]): void {
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
      const txids = selected.map(v => v.txid);
      this.markVtxosSpent(address, txids);
    }
  }

  /**
   * Sends tokens to another address
   */
  async send(amount: number, to: string): Promise<string> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Generate a fake transaction ID
    const txid = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');

    return txid;
  }

  /**
   * Claims a refund by adding a new VTXO
   * Simulates spending the VTXO via the refund path
   */
  async claimRefund(amount: number, address: string): Promise<void> {
    // Add a new VTXO (simulating the refund)
    this.addVtxo(address, amount);
    
    // Optional: Log that we would construct the witness stack
    // Note: In a real implementation, we would construct the witness stack here
    // using getRefundWitness(signature, lockParams, swapResult)
    console.log('Witness Stack Constructed (refund path)');
  }
}

// Export a singleton instance (constructor is empty, so this is safe)
export const mockArkClient = new MockArkClient();
