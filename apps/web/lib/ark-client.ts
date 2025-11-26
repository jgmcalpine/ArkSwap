import { walletTools } from './crypto';
import type { Vtxo, ArkTransaction, ArkInput, ArkOutput, Address, TxId, AssetMetadata } from '@arkswap/protocol';
import { getTxHash, VtxoSchema, AssetMetadataSchema, asTxId, asAddress, asSignatureHex, createAssetPayToPublicKey, getAssetHash } from '@arkswap/protocol';
import { z } from 'zod';

const WIF_STORAGE_KEY = 'ark_wallet_wif';
const VTXO_STORAGE_KEY = 'ark_vtxos';
const WATCHED_ADDRESSES_KEY = 'ark_watched_addresses';

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
   * Returns VTXOs that may have optional metadata and assetId fields
   */
  private getStorage(): Record<string, Array<Vtxo & { metadata?: AssetMetadata; assetId?: string }>> {
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
   * Accepts VTXOs that may have optional metadata and assetId fields
   */
  private setStorage(vtxos: Record<string, Array<Vtxo & { metadata?: AssetMetadata; assetId?: string }>>) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(VTXO_STORAGE_KEY, JSON.stringify(vtxos));
  }

  /**
   * Adds an address to the watched addresses list
   */
  addWatchedAddress(address: string): void {
    if (typeof window === 'undefined') return;
    const watched = this.getWatchedAddresses();
    if (!watched.includes(address)) {
      watched.push(address);
      localStorage.setItem(WATCHED_ADDRESSES_KEY, JSON.stringify(watched));
    }
  }

  /**
   * Gets all watched addresses
   */
  getWatchedAddresses(): string[] {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem(WATCHED_ADDRESSES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to parse watched addresses", e);
      return [];
    }
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
   * Private helper: Signs a hash using BIP-86 (Taproot) tweaked private key
   * Returns the signature as a hex string
   */
  private async signSchnorr(hash: Buffer): Promise<string> {
    const { bitcoin, ECPair, network } = walletTools;
    const keyPair = await this.getKeyPair();

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

    // Sign using the TWEAKED private key
    const signatureRaw = walletTools.ecc.signSchnorr(hash, tweakedPrivateKey);
    return Buffer.from(signatureRaw).toString('hex');
  }

  /**
   * Mints a Gen 0 Koi asset
   * @param amount - Amount in sats to mint the asset with
   * @returns Promise with success status, address, metadata, and status message
   */
  async mintGen0(amount: number): Promise<{ success: boolean; address: string; status: string; metadata: AssetMetadata }> {
    // Get the current wallet's public key
    const pubkeyBuffer = await this.getPublicKey();
    
    // Convert pubkey to hex string (64 hex characters for 32 bytes)
    const userPubkey = pubkeyBuffer.toString('hex');
    
    // Call the ASP genesis endpoint
    const response = await fetch('http://localhost:7070/v1/assets/genesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPubkey, amount }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `Failed to mint Gen 0 Koi: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Validate and parse metadata
    const metadata = AssetMetadataSchema.parse(result.metadata);
    
    // Derive the asset address using the wallet's pubkey and metadata
    const assetAddress = createAssetPayToPublicKey(pubkeyBuffer, metadata);
    
    // Add the asset address to watched addresses so we can poll for it
    this.addWatchedAddress(assetAddress);
    
    return {
      success: result.success,
      address: result.address,
      status: result.status,
      metadata,
    };
  }

  /**
   * Gets the total balance for an address by summing unspent VTXOs
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
   * Gets the spendable payment balance for an address.
   * Excludes any VTXOs that have asset metadata attached.
   */
  getPaymentBalance(address: string): number {
    const vtxos = this.getStorage();
    const addressBranded = asAddress(address);
    const addressVtxos = vtxos[address] ?? [];
    return addressVtxos
      .filter(vtxo => !vtxo.spent && vtxo.address === addressBranded && !vtxo.metadata)
      .reduce((sum, vtxo) => sum + vtxo.amount, 0);
  }

  /**
   * Gets all unspent VTXOs for an address
   * Returns VTXOs that may have optional metadata and assetId fields
   */
  getVtxos(address: string): Array<Vtxo & { metadata?: AssetMetadata; assetId?: string }> {
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

    // Exclude any VTXOs that have asset metadata – these are collectible assets, not payment coins
    const paymentCandidates = myCoins.filter(v => !v.metadata && !v.spent);

    // Sort by amount descending for better selection (First-Fit on payment candidates only)
    const sorted = [...paymentCandidates].sort((a, b) => b.amount - a.amount);
    
    let selected: Vtxo[] = [];
    let total = 0;
    
    for (const vtxo of sorted) {
      if (total >= targetAmount) break;
      selected.push(vtxo);
      total += vtxo.amount;
    }
    
    if (total < targetAmount) {
      const totalValue = myCoins.reduce((sum, vtxo) => sum + vtxo.amount, 0);
      const paymentTotal = paymentCandidates.reduce((sum, vtxo) => sum + vtxo.amount, 0);

      // User has enough total value, but too much of it is locked in asset VTXOs
      if (totalValue >= targetAmount && paymentTotal < targetAmount) {
        throw new Error('Insufficient Payment Funds');
      }
    }

    return selected;
  }

  /**
   * Selects specific asset VTXOs by txid for game mechanics (breeding, showcase, etc.)
   * Throws if any requested VTXO is not found for the address or is already spent.
   */
  selectAssetCoins(address: string, assetTxIds: string[]): Vtxo[] {
    const vtxos = this.getStorage();
    const addressBranded = asAddress(address);
    const addressVtxos = vtxos[address] ?? [];

    const selectedAssets: Vtxo[] = [];

    for (const txid of assetTxIds) {
      const brandedTxId = asTxId(txid);
      const match = addressVtxos.find(vtxo => vtxo.txid === brandedTxId && vtxo.address === addressBranded);

      if (!match || match.spent) {
        throw new Error('Requested asset VTXO not found or already spent');
      }

      selectedAssets.push(match);
    }

    return selectedAssets;
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
   * Fetches VTXOs for a single address from the ASP and merges them into local storage
   * For new VTXOs, attempts to fetch asset metadata and attach it
   */
  private async fetchAddressFromASP(address: string): Promise<void> {
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
      
      // Identify new VTXOs
      const newVtxos: Array<Vtxo & { metadata?: AssetMetadata; assetId?: string }> = [];
      for (const aspVtxo of aspVtxos) {
        const exists = addressVtxos.some(v => v.txid === aspVtxo.txid);
        if (!exists) {
          newVtxos.push(aspVtxo);
        }
      }
      
      // If we have new VTXOs, fetch asset metadata for each in parallel
      if (newVtxos.length > 0) {
        const enrichedVtxos = await Promise.all(
          newVtxos.map(async (vtxo) => {
            try {
              const assetResponse = await fetch(`http://localhost:7070/v1/assets/${vtxo.txid}`);
              
              // Handle actual HTTP errors (500s, network issues, etc.)
              if (!assetResponse.ok) {
                console.warn(`[Radar] Asset fetch failed for ${vtxo.txid}: ${assetResponse.status}`);
                return vtxo;
              }
              
              // Read response as text first to handle empty bodies gracefully
              // ASP might return empty body (Content-Length: 0) or "null" string for standard VTXOs
              const text = await assetResponse.text();
              const assetData = text ? JSON.parse(text) : null;
              
              // If null, this is a standard VTXO (not an asset) - valid state, no metadata
              if (!assetData) {
                return vtxo;
              }
              
              // If we have data, validate and process the metadata
              const metadata = AssetMetadataSchema.parse(assetData);
              
              // Use DNA as assetId (as per protocol convention)
              return {
                ...vtxo,
                metadata,
                assetId: metadata.dna,
              };
            } catch (error) {
              // Network error or parse error - continue with normal VTXO
              console.warn(`[Radar] Error fetching asset metadata for ${vtxo.txid}:`, error);
              return vtxo;
            }
          })
        );
        
        // Add enriched VTXOs to storage
        addressVtxos.push(...enrichedVtxos);
        vtxos[address] = addressVtxos;
        this.setStorage(vtxos);
      }
    } catch (error) {
      // Silently fail if ASP is not available
      console.error(`Failed to fetch from ASP for address ${address}:`, error);
    }
  }

  /**
   * Fetches VTXOs from the ASP for the main address and all watched addresses
   * For new VTXOs, attempts to fetch asset metadata and attach it
   */
  async fetchFromASP(mainAddress: string): Promise<void> {
    // Build list of addresses to poll: main address + all watched addresses
    const addressesToPoll = [mainAddress, ...this.getWatchedAddresses()];
    
    // Remove duplicates
    const uniqueAddresses = Array.from(new Set(addressesToPoll));
    
    // Fetch VTXOs for all addresses in parallel
    await Promise.all(
      uniqueAddresses.map(address => this.fetchAddressFromASP(address))
    );
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

    // 5. Sign Inputs
    const inputs: ArkInput[] = await Promise.all(
      selected.map(async (coin) => {
        const signatureHex = await this.signSchnorr(txHashBuffer);
        return {
          txid: coin.txid,
          vout: coin.vout,
          signature: asSignatureHex(signatureHex),
        };
      })
    );

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
   * Clears all wallet data from localStorage (WIF, VTXOs, and watched addresses)
   * Used when disconnecting a wallet
   */
  clearWallet(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(WIF_STORAGE_KEY);
    localStorage.removeItem(VTXO_STORAGE_KEY);
    localStorage.removeItem(WATCHED_ADDRESSES_KEY);
  }

  /**
   * Fetches global stats from the ASP
   */
  async getStats(): Promise<{ total: number; distribution: Record<string, number> }> {
    const response = await fetch('http://localhost:7070/v1/assets/stats');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }
    
    // Read response as text first to handle empty bodies gracefully
    const text = await response.text();
    return text ? JSON.parse(text) : { total: 0, distribution: { common: 0, rare: 0, epic: 0, legendary: 0 } };
  }

  /**
   * Fetches the list of showcased assets from the Pond
   */
  async getPond(): Promise<Array<{ txid: string; metadata: AssetMetadata }>> {
    const response = await fetch('http://localhost:7070/v1/pond');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch pond: ${response.statusText}`);
    }
    
    // Read response as text first to handle empty bodies gracefully
    const text = await response.text();
    const data = text ? JSON.parse(text) : [];
    
    // Validate metadata for each item
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data.map((item: { txid: string; metadata: unknown }) => ({
      txid: item.txid,
      metadata: AssetMetadataSchema.parse(item.metadata),
    }));
  }

  /**
   * Fetches ASP info including current block height
   */
  async getInfo(): Promise<{ pubkey: string; roundInterval: number; network: string; currentBlock: number }> {
    const response = await fetch('http://localhost:7070/v1/info');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch info: ${response.statusText}`);
    }
    
    return await response.json();
  }

  /**
   * Signs a message for pond entry (extracted for testing)
   * @param txid - The transaction ID to sign
   * @returns Object containing the message and signature hex string
   */
  async signPondEntry(txid: TxId): Promise<{ message: string; signature: string }> {
    const { bitcoin, ECPair, ecc } = walletTools;
    const vtxos = this.getStorage();
    
    // Step 1: Find VTXO across all addresses
    let vtxo: (Vtxo & { metadata?: AssetMetadata; assetId?: string }) | undefined;
    for (const addr in vtxos) {
      vtxo = vtxos[addr].find(v => v.txid === txid);
      if (vtxo) break;
    }
    
    if (!vtxo) {
      throw new Error('VTXO not found');
    }
    
    // Step 2: Create message and hash
    const message = `Showcase ${txid}`;
    const messageHash = bitcoin.crypto.sha256(Buffer.from(message, 'utf8'));
    
    // Step 3: Get keypair and prepare private key
    const keyPair = await this.getKeyPair();
    if (!keyPair.privateKey) {
      throw new Error('Missing private key');
    }
    
    // Prepare private key buffer (32 bytes)
    let privateKeyBuffer = keyPair.privateKey.length === 33 
      ? keyPair.privateKey.slice(1) 
      : keyPair.privateKey;
    
    // Step 4: Handle Base Key Parity
    // If the public key has an ODD Y-coordinate (prefix 0x03), negate the private key
    if (keyPair.publicKey[0] === 0x03) {
      privateKeyBuffer = Buffer.from(ecc.privateNegate(privateKeyBuffer));
    }
    
    // Step 5: Apply Asset Tweak (if metadata exists)
    let assetPubkey: Buffer | undefined;
    if (vtxo.metadata) {
      const assetTweak = getAssetHash(vtxo.metadata);
      const assetPrivateKey = ecc.privateAdd(privateKeyBuffer, assetTweak);
      if (!assetPrivateKey) {
        throw new Error('Asset tweak failed');
      }
      privateKeyBuffer = Buffer.from(assetPrivateKey);
      
      // Step 6: Handle Asset Pubkey Parity
      // Get the intermediate pubkey (P') to check parity
      const tempPair = ECPair.fromPrivateKey(privateKeyBuffer);
      assetPubkey = tempPair.publicKey;
      
      // If assetPubkey has odd Y-coordinate, negate the private key
      if (assetPubkey[0] === 0x03) {
        privateKeyBuffer = Buffer.from(ecc.privateNegate(privateKeyBuffer));
        // Recreate pair with negated key to get updated pubkey
        const negatedPair = ECPair.fromPrivateKey(privateKeyBuffer);
        assetPubkey = negatedPair.publicKey;
      }
    }
    
    // Step 7: Apply BIP-86 TapTweak (Standard for P2TR)
    // Use assetPubkey if available (from asset tweak), otherwise get from base key
    let pPrime: Buffer;
    if (assetPubkey) {
      pPrime = assetPubkey.slice(1, 33);
    } else {
      // No asset tweak, use the base key's x-only pubkey
      const basePair = ECPair.fromPrivateKey(privateKeyBuffer);
      pPrime = basePair.publicKey.slice(1, 33);
    }
    
    // Calculate TapTweak
    const tapTweak = bitcoin.crypto.taggedHash('TapTweak', pPrime);
    const finalPrivateKey = ecc.privateAdd(privateKeyBuffer, tapTweak);
    if (!finalPrivateKey) {
      throw new Error('Taproot tweak failed');
    }
    
    // Step 8: Sign the hash
    const signatureRaw = ecc.signSchnorr(messageHash, finalPrivateKey);
    const signature = Buffer.from(signatureRaw).toString('hex');
    
    return { message, signature };
  }

  /**
   * Enters a VTXO into the Pond by signing a proof of ownership
   */
  async enterPond(vtxo: Vtxo): Promise<{ success: boolean }> {
    // Sign the message
    const { message, signature } = await this.signPondEntry(vtxo.txid);
    
    // Post to /v1/pond/enter
    const response = await fetch('http://localhost:7070/v1/pond/enter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txid: vtxo.txid,
        signature,
        message,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Failed to enter pond');
    }
    
    return await response.json();
  }

  /**
   * Signs a message for feeding a Koi (reuses signPondEntry logic with different message)
   * @param txid - The transaction ID to sign
   * @returns Object containing the message and signature hex string
   */
  async signFeedMessage(txid: TxId): Promise<{ message: string; signature: string }> {
    const { bitcoin, ECPair, ecc } = walletTools;
    const vtxos = this.getStorage();
    
    // Step 1: Find VTXO across all addresses
    let vtxo: (Vtxo & { metadata?: AssetMetadata; assetId?: string }) | undefined;
    for (const addr in vtxos) {
      vtxo = vtxos[addr].find(v => v.txid === txid);
      if (vtxo) break;
    }
    
    if (!vtxo) {
      throw new Error('VTXO not found');
    }
    
    // Step 2: Create message and hash (different message format for feeding)
    const message = `Feed ${txid}`;
    const messageHash = bitcoin.crypto.sha256(Buffer.from(message, 'utf8'));
    
    // Step 3: Get keypair and prepare private key
    const keyPair = await this.getKeyPair();
    if (!keyPair.privateKey) {
      throw new Error('Missing private key');
    }
    
    // Prepare private key buffer (32 bytes)
    let privateKeyBuffer = keyPair.privateKey.length === 33 
      ? keyPair.privateKey.slice(1) 
      : keyPair.privateKey;
    
    // Step 4: Handle Base Key Parity
    // If the public key has an ODD Y-coordinate (prefix 0x03), negate the private key
    if (keyPair.publicKey[0] === 0x03) {
      privateKeyBuffer = Buffer.from(ecc.privateNegate(privateKeyBuffer));
    }
    
    // Step 5: Apply Asset Tweak (if metadata exists)
    let assetPubkey: Buffer | undefined;
    if (vtxo.metadata) {
      const assetTweak = getAssetHash(vtxo.metadata);
      const assetPrivateKey = ecc.privateAdd(privateKeyBuffer, assetTweak);
      if (!assetPrivateKey) {
        throw new Error('Asset tweak failed');
      }
      privateKeyBuffer = Buffer.from(assetPrivateKey);
      
      // Step 6: Handle Asset Pubkey Parity
      // Get the intermediate pubkey (P') to check parity
      const tempPair = ECPair.fromPrivateKey(privateKeyBuffer);
      assetPubkey = tempPair.publicKey;
      
      // If assetPubkey has odd Y-coordinate, negate the private key
      if (assetPubkey[0] === 0x03) {
        privateKeyBuffer = Buffer.from(ecc.privateNegate(privateKeyBuffer));
        // Recreate pair with negated key to get updated pubkey
        const negatedPair = ECPair.fromPrivateKey(privateKeyBuffer);
        assetPubkey = negatedPair.publicKey;
      }
    }
    
    // Step 7: Apply BIP-86 TapTweak (Standard for P2TR)
    // Use assetPubkey if available (from asset tweak), otherwise get from base key
    let pPrime: Buffer;
    if (assetPubkey) {
      pPrime = assetPubkey.slice(1, 33);
    } else {
      // No asset tweak, use the base key's x-only pubkey
      const basePair = ECPair.fromPrivateKey(privateKeyBuffer);
      pPrime = basePair.publicKey.slice(1, 33);
    }
    
    // Calculate TapTweak
    const tapTweak = bitcoin.crypto.taggedHash('TapTweak', pPrime);
    const finalPrivateKey = ecc.privateAdd(privateKeyBuffer, tapTweak);
    if (!finalPrivateKey) {
      throw new Error('Taproot tweak failed');
    }
    
    // Step 8: Sign the hash
    const signatureRaw = ecc.signSchnorr(messageHash, finalPrivateKey);
    const signature = Buffer.from(signatureRaw).toString('hex');
    
    return { message, signature };
  }

  /**
   * Feeds a Koi by signing a message and posting to the feed endpoint
   * Updates local VTXO metadata with the response
   */
  async feedKoi(vtxo: Vtxo & { metadata?: AssetMetadata }): Promise<{ success: boolean; metadata: AssetMetadata }> {
    // Sign the message
    const { message, signature } = await this.signFeedMessage(vtxo.txid);
    
    // Post to /v1/assets/feed
    const response = await fetch('http://localhost:7070/v1/assets/feed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        txid: vtxo.txid,
        signature,
        message,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || error.error || 'Failed to feed Koi');
    }
    
    const result = await response.json();
    
    // Validate and parse metadata
    const metadata = AssetMetadataSchema.parse(result.metadata);
    
    // Update local VTXO with new metadata (xp, lastFedBlock)
    const allVtxos = this.getStorage();
    for (const addr in allVtxos) {
      const index = allVtxos[addr].findIndex(v => v.txid === vtxo.txid);
      if (index !== -1) {
        allVtxos[addr][index].metadata = result.metadata; // <--- SAVE NEW STATE
        allVtxos[addr][index].assetId = result.metadata.dna; // Preserve assetId
        this.setStorage(allVtxos);
        break;
      }
    }
    
    return { success: result.success, metadata };
  }
}

// Export a singleton instance (constructor is empty, so this is safe)
export const mockArkClient = new MockArkClient();
