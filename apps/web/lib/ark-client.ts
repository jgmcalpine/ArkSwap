import { walletTools } from './crypto';

const WIF_STORAGE_KEY = 'ark_wallet_wif';
const BALANCE_STORAGE_KEY = 'ark_mock_balances';

export class MockArkClient {
  /**
   * EMPTY CONSTRUCTOR - Do not load keys, do not access localStorage, do not call crypto.
   * All initialization happens lazily in methods.
   */
  constructor() {
    // Intentionally empty - no side effects
  }

  /**
   * Helper to read balances from LocalStorage (only called from methods)
   */
  private getStorage(): Record<string, number> {
    if (typeof window === 'undefined') return {};
    try {
      const stored = localStorage.getItem(BALANCE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.error("Failed to parse ark balances", e);
      return {};
    }
  }

  /**
   * Helper to save balances to LocalStorage (only called from methods)
   */
  private setStorage(balances: Record<string, number>) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(BALANCE_STORAGE_KEY, JSON.stringify(balances));
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
   * Gets the balance for an address (defaults to 0)
   * NOW PERSISTENT via LocalStorage
   */
  getBalance(address: string): number {
    const balances = this.getStorage();
    return balances[address] ?? 0;
  }

  /**
   * Sets the balance for an address
   */
  setBalance(address: string, balance: number): void {
    const balances = this.getStorage();
    balances[address] = balance;
    this.setStorage(balances);
  }

  /**
   * Adds to the balance for an address
   */
  addBalance(address: string, amount: number): void {
    const balances = this.getStorage();
    const current = balances[address] ?? 0;
    balances[address] = current + amount;
    this.setStorage(balances);
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
   * Claims a refund by adding the amount back to the balance
   * Simulates spending the VTXO via the refund path
   */
  async claimRefund(amount: number, address: string): Promise<void> {
    // Add the amount back to the balance (simulating the VTXO spend)
    this.addBalance(address, amount);
    
    // Optional: Log that we would construct the witness stack
    // Note: In a real implementation, we would construct the witness stack here
    // using getRefundWitness(signature, lockParams, swapResult)
    console.log('Witness Stack Constructed (refund path)');
  }
}

// Export a singleton instance (constructor is empty, so this is safe)
export const mockArkClient = new MockArkClient();
