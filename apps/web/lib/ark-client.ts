import { walletTools } from './crypto';
import type { Vtxo, ArkTransaction, ArkInput, ArkOutput } from '@arkswap/protocol';
import { getTxHash } from '@arkswap/protocol';
import ecc from '@bitcoinerlab/secp256k1';

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
   * Simulates an employer payment (renamed from faucet)
   */
  simulateEmployerPayment(address: string, amount: number): void {
    this.addVtxo(address, amount);
  }

  /**
   * Initiates a lift (onboarding) request to the ASP
   */
  async lift(address: string, amount: number): Promise<{ status: string; nextRound: string }> {
    const response = await fetch('http://localhost:7070/v1/lift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, amount }),
    });

    if (!response.ok) {
      throw new Error(`Lift request failed: ${response.statusText}`);
    }

    return response.json();
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

      const aspVtxos: Vtxo[] = await response.json();
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
    const { ECPair } = walletTools;
    const keyPair = await this.getKeyPair();
    const myAddress = await this.getAddress();
    
    if (!myAddress) {
      throw new Error('No wallet found. Please create a wallet first.');
    }

    // 1. Select Coins
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
      { address: toAddress, amount },
    ];

    // Add change output if necessary
    if (change > 0) {
      outputs.push({ address: myAddress, amount: change });
    }

    // 3. Prepare Inputs (Without Signatures first)
    // We need the TXID/Vout to calculate the hash
    const inputsUnsigned = selected.map(coin => ({
      txid: coin.txid,
      vout: coin.vout,
    }));

    // 4. Calculate Transaction Hash
    // This is what we sign. It commits to the inputs and outputs.
    const txHashHex = await getTxHash(inputsUnsigned, outputs);
    const txHashBuffer = Buffer.from(txHashHex, 'hex');

    // 5. Sign Inputs (BIP-86 Compliant)
    const { bitcoin: bitcoinLib } = walletTools;
    const privateKey = keyPair.privateKey;
    if (!privateKey) {
      throw new Error('Private key not available');
    }
    
    // Ensure private key is 32 bytes (x-only for Schnorr)
    // ECPair privateKey is 33 bytes (with prefix), we need 32 bytes for Schnorr
    const privateKeyBuffer = privateKey.length === 33 ? privateKey.slice(1) : privateKey;
    
    // Verify private key is 32 bytes
    if (privateKeyBuffer.length !== 32) {
      throw new Error(`Invalid private key length: ${privateKeyBuffer.length} (expected 32)`);
    }

    // Get the x-only internal pubkey (32 bytes)
    const internalPubkey = keyPair.publicKey.slice(1, 33); // x-only

    // 1. Calculate Tweak (BIP-86)
    // If there is no merkle root (Key Path), the tweak is Hash_TapTweak(Pubkey)
    const tweakHash = bitcoinLib.crypto.taggedHash('TapTweak', internalPubkey);

    // 2. Tweak the Private Key
    // We need direct access to the ECC library for this math
    if (!ecc || !(ecc as any).privateAdd) {
      throw new Error('ECC Lib missing privateAdd');
    }

    const tweakedPrivateKey = (ecc as any).privateAdd(privateKeyBuffer, tweakHash);

    if (!tweakedPrivateKey) {
      throw new Error('Failed to tweak private key');
    }

    // 3. Log for Debugging
    console.log('[Client] Internal Pubkey:', internalPubkey.toString('hex'));
    console.log('[Client] Signing Hash:', txHashHex);

    // 4. Sign with TWEAKED Key (Direct ECC - No ECPair abstraction)
    const inputs: ArkInput[] = selected.map((coin) => {
      // Sign the hash using Schnorr with the tweaked private key
      // @bitcoinerlab/secp256k1 signSchnorr(messageHash, privateKey)
      // Note: signSchnorr returns Uint8Array, not Buffer
      const signatureRaw = (ecc as any).signSchnorr(txHashBuffer, Buffer.from(tweakedPrivateKey));
      
      // CRITICAL: Wrap Uint8Array in Buffer.from() before calling toString('hex')
      // Direct .toString('hex') on Uint8Array produces CSV string, not hex
      const signatureHex = Buffer.from(signatureRaw).toString('hex');
      
      // Log signature after creation
      console.log('[Client] Signature:', signatureHex);
      
      // Validate signature was created
      if (!signatureHex || signatureHex.length === 0) {
        throw new Error('Failed to create signature');
      }
      
      // Schnorr signatures are 64 bytes = 128 hex characters
      if (signatureHex.length !== 128) {
        throw new Error(`Invalid signature length: ${signatureHex.length} (expected 128)`);
      }
      
      return {
        txid: coin.txid,
        vout: coin.vout,
        signature: signatureHex, // <--- CRITICAL: Hex String, not Buffer
      };
    });

    // 6. Create Transaction
    const tx: ArkTransaction = { inputs, outputs };

    // 7. Broadcast to ASP
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

    // 8. Update Local State
    // Mark inputs as spent
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

    // Note: We rely on the Poller (Chunk 12) to pick up the new Change VTXO
    // when the round finalizes. We don't add it manually here to avoid desync.

    return result.transferId || result.txid; // The Round/Transfer ID
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
