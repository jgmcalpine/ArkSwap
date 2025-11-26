import { MockArkClient } from './ark-client';
import { walletTools } from './crypto';
import { asTxId, asAddress, getAssetHash, createAssetPayToPublicKey } from '@arkswap/protocol';
import type { Vtxo, AssetMetadata } from '@arkswap/protocol';
import * as bitcoin from 'bitcoinjs-lib';
import { createHash } from 'crypto';
import ecc from '@bitcoinerlab/secp256k1';

// JSDOM provides localStorage automatically, but we'll ensure it's cleared between tests

describe('MockArkClient - Pond Entry Signing', () => {
  let client: MockArkClient;
  let mockVtxo: Vtxo;
  let walletAddress: string;
  let walletPubkey: Buffer;

  beforeEach(async () => {
    // Create a fresh client instance for each test
    client = new MockArkClient();
    
    // Create a wallet
    walletAddress = await client.createWallet();
    walletPubkey = await client.getPublicKey();
    
    // Add the VTXO to the client's storage
    client.addVtxo(walletAddress, 1000);
    
    // Get the actual VTXO that was added (with its generated txid)
    const vtxos = client.getVtxos(walletAddress);
    if (vtxos.length === 0) {
      throw new Error('Failed to add VTXO');
    }
    mockVtxo = vtxos[0];
  });

  afterEach(() => {
    // Clean up localStorage between tests (jsdom provides this automatically)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('signPondEntry', () => {
    it('should generate valid Schnorr signature for pond entry', async () => {
      // 1. Sign the message using the client's signing logic
      const { message, signature } = await client.signPondEntry(mockVtxo.txid);
      
      // 2. Verify the message format
      expect(message).toBe(`Showcase ${mockVtxo.txid}`);
      
      // 3. Verify signature is a hex string (64 bytes = 128 hex chars)
      expect(signature).toMatch(/^[0-9a-f]{128}$/i);
      
      // 4. Reconstruct the message hash (same as client does)
      const { bitcoin, ecc } = walletTools;
      const messageHashBuffer = bitcoin.crypto.sha256(Buffer.from(message, 'utf8'));
      
      // 5. Extract the tweaked public key from the address (same as server does)
      // The server uses bitcoin.address.toOutputScript to extract the pubkey
      const outputScript = bitcoin.address.toOutputScript(walletAddress, bitcoin.networks.regtest);
      
      // Taproot Script is: OP_1 (0x51) <32-byte-pubkey>
      expect(outputScript.length).toBe(34);
      expect(outputScript[0]).toBe(0x51);
      expect(outputScript[1]).toBe(0x20);
      
      const pubkey = Buffer.from(outputScript.slice(2, 34));
      
      // 6. Verify the signature using @bitcoinerlab/secp256k1 (same as server)
      const signatureBuffer = Buffer.from(signature, 'hex');
      const isValid = ecc.verifySchnorr(messageHashBuffer, pubkey, signatureBuffer);
      
      // 7. Assert the signature is valid
      expect(isValid).toBe(true);
    });

    it('should produce different signatures for different txids', async () => {
      const { signature: sig1 } = await client.signPondEntry(mockVtxo.txid);
      
      // Add another VTXO to get a different txid
      client.addVtxo(walletAddress, 500);
      const vtxos = client.getVtxos(walletAddress);
      const differentVtxo = vtxos.find(v => v.txid !== mockVtxo.txid);
      if (!differentVtxo) {
        throw new Error('Failed to create different VTXO');
      }
      const { signature: sig2 } = await client.signPondEntry(differentVtxo.txid);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should produce valid signatures for the same txid (may be non-deterministic)', async () => {
      // Note: Schnorr signatures may use random nonces, so signatures may differ
      // but both should be valid for the same message
      const { message, signature: sig1 } = await client.signPondEntry(mockVtxo.txid);
      const { signature: sig2 } = await client.signPondEntry(mockVtxo.txid);
      
      // Both signatures should be valid hex strings
      expect(sig1).toMatch(/^[0-9a-f]{128}$/i);
      expect(sig2).toMatch(/^[0-9a-f]{128}$/i);
      
      // Verify both signatures are valid (even if different)
      const { bitcoin, ecc } = walletTools;
      const messageHashBuffer = bitcoin.crypto.sha256(Buffer.from(message, 'utf8'));
      const outputScript = bitcoin.address.toOutputScript(walletAddress, bitcoin.networks.regtest);
      const pubkey = Buffer.from(outputScript.slice(2, 34));
      
      const isValid1 = ecc.verifySchnorr(messageHashBuffer, pubkey, Buffer.from(sig1, 'hex'));
      const isValid2 = ecc.verifySchnorr(messageHashBuffer, pubkey, Buffer.from(sig2, 'hex'));
      
      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);
    });

    it('should verify signature matches server-side verification logic', async () => {
      // This test simulates the server-side verification from PondController
      const { message, signature } = await client.signPondEntry(mockVtxo.txid);
      
      // Server-side logic (from pond.controller.ts):
      // 1. Reconstruct message hash (SHA256)
      const messageHash = createHash('sha256').update(message).digest();
      const messageHashBuffer = Buffer.from(messageHash);
      
      // 2. Decode address to get pubkey (server extracts from Taproot script)
      const outputScript = bitcoin.address.toOutputScript(walletAddress, bitcoin.networks.regtest);
      
      // Taproot Script is: OP_1 (0x51) <32-byte-pubkey>
      expect(outputScript.length).toBe(34);
      expect(outputScript[0]).toBe(0x51);
      expect(outputScript[1]).toBe(0x20);
      
      const pubkey = Buffer.from(outputScript.slice(2, 34));
      
      // 3. Verify Schnorr Signature (server uses ecc.verifySchnorr)
      const { ecc } = walletTools;
      const signatureBuffer = Buffer.from(signature, 'hex');
      const isValid = ecc.verifySchnorr(messageHashBuffer, pubkey, signatureBuffer);
      
      expect(isValid).toBe(true);
    });

    it('should generate valid signature for Asset VTXO', async () => {
      // Setup: Create a mock Asset VTXO with metadata
      const mockMetadata: AssetMetadata = {
        dna: 'a'.repeat(64) as AssetMetadata['dna'],
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
        parents: [],
      };

      // Create asset address using the same logic as mintGen0
      const assetAddress = createAssetPayToPublicKey(walletPubkey, mockMetadata);

      // Generate a random txid for the asset VTXO
      const assetTxid = Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      // Create asset VTXO with metadata
      const assetVtxo: Vtxo & { metadata?: AssetMetadata; assetId?: string } = {
        txid: asTxId(assetTxid),
        vout: 0,
        amount: 1000,
        address: asAddress(assetAddress),
        spent: false,
        metadata: mockMetadata,
        assetId: mockMetadata.dna,
      };

      // Add the asset VTXO to storage manually (since addVtxo doesn't support metadata)
      const vtxos = (client as any).getStorage();
      if (!vtxos[assetAddress]) {
        vtxos[assetAddress] = [];
      }
      vtxos[assetAddress].push(assetVtxo);
      (client as any).setStorage(vtxos);

      // Execution: Sign the asset VTXO
      const { message, signature } = await client.signPondEntry(assetVtxo.txid);

      // Verification: Manually reconstruct the expected pubkey (matching signPondEntry logic)
      // Step 1: Start with Wallet Pubkey (x-only, 32 bytes)
      const basePubkey = walletPubkey;

      // Step 2: Apply Asset Tweak (same as signPondEntry does)
      const assetTweak = getAssetHash(mockMetadata);
      const assetTweakResult = ecc.xOnlyPointAddTweak(basePubkey, assetTweak);
      if (!assetTweakResult || !assetTweakResult.xOnlyPubkey) {
        throw new Error('Failed to apply asset tweak');
      }
      const assetPubkey = Buffer.from(assetTweakResult.xOnlyPubkey);

      // Step 3: Apply Taproot Tweak (BIP-86)
      // The signing code uses the asset pubkey as the internal pubkey for Taproot tweak
      const tapTweak = bitcoin.crypto.taggedHash('TapTweak', assetPubkey);
      const finalTweakResult = ecc.xOnlyPointAddTweak(assetPubkey, tapTweak);
      if (!finalTweakResult || !finalTweakResult.xOnlyPubkey) {
        throw new Error('Failed to apply Taproot tweak');
      }
      const finalPubkey = Buffer.from(finalTweakResult.xOnlyPubkey);

      // Step 4: Verify the signature
      const { bitcoin: bitcoinLib, ecc: eccLib } = walletTools;
      const messageHashBuffer = bitcoinLib.crypto.sha256(Buffer.from(message, 'utf8'));
      const signatureBuffer = Buffer.from(signature, 'hex');

      // Verify signature format
      expect(signature).toMatch(/^[0-9a-f]{128}$/i);
      expect(message).toBe(`Showcase ${assetVtxo.txid}`);

      // Verify signature against the final pubkey (with both tweaks applied)
      const isValid = eccLib.verifySchnorr(messageHashBuffer, finalPubkey, signatureBuffer);
      expect(isValid).toBe(true);
    });
  });
});

