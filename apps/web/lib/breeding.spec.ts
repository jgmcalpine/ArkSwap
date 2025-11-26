import { MockArkClient } from './ark-client';
import { walletTools } from './crypto';
import { asTxId, asAddress, getAssetHash, createAssetPayToPublicKey } from '@arkswap/protocol';
import type { Vtxo, AssetMetadata } from '@arkswap/protocol';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { getTxHash } from '@arkswap/protocol';

// Mock fetch globally
global.fetch = jest.fn();

describe('MockArkClient - Breeding Logic', () => {
  let client: MockArkClient;
  let walletAddress: string;
  let walletPubkey: Buffer;
  let parent1Vtxo: Vtxo & { metadata?: AssetMetadata; assetId?: string };
  let parent2Vtxo: Vtxo & { metadata?: AssetMetadata; assetId?: string };
  let cashVtxo: Vtxo;

  beforeEach(async () => {
    // Reset fetch mock
    (global.fetch as jest.Mock).mockClear();

    // Create a fresh client instance
    client = new MockArkClient();
    
    // Create a wallet
    walletAddress = await client.createWallet();
    walletPubkey = await client.getPublicKey();

    // Create Parent 1 Asset VTXO with DNA A
    const metadata1: AssetMetadata = {
      dna: 'a'.repeat(64) as AssetMetadata['dna'],
      generation: 0,
      cooldownBlock: 100,
      lastFedBlock: 50,
      xp: 0,
      parents: [],
    };
    const assetAddress1 = createAssetPayToPublicKey(walletPubkey, metadata1);
    const parent1Txid = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    parent1Vtxo = {
      txid: asTxId(parent1Txid),
      vout: 0,
      amount: 1000,
      address: asAddress(assetAddress1),
      spent: false,
      metadata: metadata1,
      assetId: metadata1.dna,
    };

    // Create Parent 2 Asset VTXO with DNA B
    const metadata2: AssetMetadata = {
      dna: 'b'.repeat(64) as AssetMetadata['dna'],
      generation: 0,
      cooldownBlock: 100,
      lastFedBlock: 50,
      xp: 0,
      parents: [],
    };
    const assetAddress2 = createAssetPayToPublicKey(walletPubkey, metadata2);
    const parent2Txid = Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    
    parent2Vtxo = {
      txid: asTxId(parent2Txid),
      vout: 0,
      amount: 1000,
      address: asAddress(assetAddress2),
      spent: false,
      metadata: metadata2,
      assetId: metadata2.dna,
    };

    // Create Cash VTXO for fee payment
    client.addVtxo(walletAddress, 1000);
    const cashVtxos = client.getVtxos(walletAddress);
    if (cashVtxos.length === 0) {
      throw new Error('Failed to create cash VTXO');
    }
    cashVtxo = cashVtxos[0];

    // Add parent VTXOs to storage manually
    const vtxos = (client as any).getStorage();
    if (!vtxos[assetAddress1]) {
      vtxos[assetAddress1] = [];
    }
    vtxos[assetAddress1].push(parent1Vtxo);
    
    if (!vtxos[assetAddress2]) {
      vtxos[assetAddress2] = [];
    }
    vtxos[assetAddress2].push(parent2Vtxo);
    
    (client as any).setStorage(vtxos);

    // Mock successful ASP response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ txid: 'test_breeding_txid', success: true }),
    });
  });

  afterEach(() => {
    // Clean up localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  describe('breed', () => {
    it('should correctly sign a mixed transaction (Assets + Cash)', async () => {
      // Execution: Call breed()
      await client.breed(parent1Vtxo.txid, parent2Vtxo.txid);

      // Verification: Intercept the fetch call
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:7070/v1/assets/breed');
      expect(fetchCall[1]?.method).toBe('POST');

      // Extract the transaction payload
      const payload = JSON.parse(fetchCall[1]?.body || '{}');
      expect(payload.inputs).toHaveLength(3); // Parent 1, Parent 2, Cash
      expect(payload.outputs).toHaveLength(2); // Egg + Change

      // Extract signatures
      const sig1 = payload.inputs[0].signature; // Parent 1
      const sig2 = payload.inputs[1].signature; // Parent 2
      const sig3 = payload.inputs[2].signature; // Cash

      // Verify all signatures are hex strings (128 hex chars = 64 bytes)
      expect(sig1).toMatch(/^[0-9a-f]{128}$/i);
      expect(sig2).toMatch(/^[0-9a-f]{128}$/i);
      expect(sig3).toMatch(/^[0-9a-f]{128}$/i);

      // Reconstruct the transaction hash (same as breed() does)
      const inputsUnsigned = payload.inputs.map((inp: { txid: string; vout: number }) => ({
        txid: inp.txid,
        vout: inp.vout,
      }));
      const txHashHex = await getTxHash(inputsUnsigned, payload.outputs);
      const txHashBuffer = Buffer.from(txHashHex, 'hex');

      // Verify Sig 1: Validate against Pubkey + Hash(DNA_A) + TapTweak
      const basePubkey = walletPubkey;
      const assetTweak1 = getAssetHash(parent1Vtxo.metadata!);
      const assetTweakResult1 = ecc.xOnlyPointAddTweak(basePubkey, assetTweak1);
      if (!assetTweakResult1 || !assetTweakResult1.xOnlyPubkey) {
        throw new Error('Failed to apply asset tweak for parent 1');
      }
      const assetPubkey1 = Buffer.from(assetTweakResult1.xOnlyPubkey);
      const tapTweak1 = bitcoin.crypto.taggedHash('TapTweak', assetPubkey1);
      const finalTweakResult1 = ecc.xOnlyPointAddTweak(assetPubkey1, tapTweak1);
      if (!finalTweakResult1 || !finalTweakResult1.xOnlyPubkey) {
        throw new Error('Failed to apply Taproot tweak for parent 1');
      }
      const finalPubkey1 = Buffer.from(finalTweakResult1.xOnlyPubkey);
      const isValid1 = ecc.verifySchnorr(txHashBuffer, finalPubkey1, Buffer.from(sig1, 'hex'));
      expect(isValid1).toBe(true);

      // Verify Sig 2: Validate against Pubkey + Hash(DNA_B) + TapTweak
      const assetTweak2 = getAssetHash(parent2Vtxo.metadata!);
      const assetTweakResult2 = ecc.xOnlyPointAddTweak(basePubkey, assetTweak2);
      if (!assetTweakResult2 || !assetTweakResult2.xOnlyPubkey) {
        throw new Error('Failed to apply asset tweak for parent 2');
      }
      const assetPubkey2 = Buffer.from(assetTweakResult2.xOnlyPubkey);
      const tapTweak2 = bitcoin.crypto.taggedHash('TapTweak', assetPubkey2);
      const finalTweakResult2 = ecc.xOnlyPointAddTweak(assetPubkey2, tapTweak2);
      if (!finalTweakResult2 || !finalTweakResult2.xOnlyPubkey) {
        throw new Error('Failed to apply Taproot tweak for parent 2');
      }
      const finalPubkey2 = Buffer.from(finalTweakResult2.xOnlyPubkey);
      const isValid2 = ecc.verifySchnorr(txHashBuffer, finalPubkey2, Buffer.from(sig2, 'hex'));
      expect(isValid2).toBe(true);

      // Verify Sig 3: Validate against Pubkey (No Asset tweak) + TapTweak
      const tapTweak3 = bitcoin.crypto.taggedHash('TapTweak', basePubkey);
      const finalTweakResult3 = ecc.xOnlyPointAddTweak(basePubkey, tapTweak3);
      if (!finalTweakResult3 || !finalTweakResult3.xOnlyPubkey) {
        throw new Error('Failed to apply Taproot tweak for cash');
      }
      const finalPubkey3 = Buffer.from(finalTweakResult3.xOnlyPubkey);
      const isValid3 = ecc.verifySchnorr(txHashBuffer, finalPubkey3, Buffer.from(sig3, 'hex'));
      expect(isValid3).toBe(true);
    });

    it('should throw error if parent 1 not found', async () => {
      const fakeTxid = asTxId('f'.repeat(64));
      await expect(client.breed(fakeTxid, parent2Vtxo.txid)).rejects.toThrow(
        'Parent 1 VTXO not found'
      );
    });

    it('should throw error if parent 2 not found', async () => {
      const fakeTxid = asTxId('f'.repeat(64));
      await expect(client.breed(parent1Vtxo.txid, fakeTxid)).rejects.toThrow(
        'Parent 2 VTXO not found'
      );
    });

    it('should throw error if parent 1 is already spent', async () => {
      // Mark parent 1 as spent
      const vtxos = (client as any).getStorage();
      for (const addr in vtxos) {
        const index = vtxos[addr].findIndex((v: Vtxo) => v.txid === parent1Vtxo.txid);
        if (index !== -1) {
          vtxos[addr][index].spent = true;
          break;
        }
      }
      (client as any).setStorage(vtxos);

      await expect(client.breed(parent1Vtxo.txid, parent2Vtxo.txid)).rejects.toThrow(
        'Parent 1 VTXO already spent'
      );
    });

    it('should throw error if parent 2 is already spent', async () => {
      // Mark parent 2 as spent
      const vtxos = (client as any).getStorage();
      for (const addr in vtxos) {
        const index = vtxos[addr].findIndex((v: Vtxo) => v.txid === parent2Vtxo.txid);
        if (index !== -1) {
          vtxos[addr][index].spent = true;
          break;
        }
      }
      (client as any).setStorage(vtxos);

      await expect(client.breed(parent1Vtxo.txid, parent2Vtxo.txid)).rejects.toThrow(
        'Parent 2 VTXO already spent'
      );
    });

    it('should throw error if trying to breed a Koi with itself', async () => {
      await expect(client.breed(parent1Vtxo.txid, parent1Vtxo.txid)).rejects.toThrow(
        'Cannot breed a Koi with itself'
      );
    });

    it('should throw error if parent is not an asset VTXO', async () => {
      // Create a payment VTXO and try to use it as a parent
      const paymentVtxo = cashVtxo;
      
      await expect(client.breed(paymentVtxo.txid, parent2Vtxo.txid)).rejects.toThrow(
        'Parent 1 is not an asset VTXO'
      );
    });

    it('should throw error if insufficient payment funds', async () => {
      // Remove all payment VTXOs
      const vtxos = (client as any).getStorage();
      if (vtxos[walletAddress]) {
        vtxos[walletAddress] = vtxos[walletAddress].filter(
          (v: Vtxo) => v.txid !== cashVtxo.txid
        );
      }
      (client as any).setStorage(vtxos);

      await expect(client.breed(parent1Vtxo.txid, parent2Vtxo.txid)).rejects.toThrow(
        'Insufficient payment funds'
      );
    });

    it('should mark all inputs as spent after successful breeding', async () => {
      await client.breed(parent1Vtxo.txid, parent2Vtxo.txid);

      // Verify all inputs are marked as spent
      const vtxos = (client as any).getStorage();
      let parent1Found = false;
      let parent2Found = false;
      let cashFound = false;

      for (const addr in vtxos) {
        for (const vtxo of vtxos[addr]) {
          if (vtxo.txid === parent1Vtxo.txid) {
            parent1Found = true;
            expect(vtxo.spent).toBe(true);
          }
          if (vtxo.txid === parent2Vtxo.txid) {
            parent2Found = true;
            expect(vtxo.spent).toBe(true);
          }
          if (vtxo.txid === cashVtxo.txid) {
            cashFound = true;
            expect(vtxo.spent).toBe(true);
          }
        }
      }

      expect(parent1Found).toBe(true);
      expect(parent2Found).toBe(true);
      expect(cashFound).toBe(true);
    });

    it('should create correct transaction outputs (egg + change)', async () => {
      await client.breed(parent1Vtxo.txid, parent2Vtxo.txid);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const payload = JSON.parse(fetchCall[1]?.body || '{}');

      // Should have 2 outputs: egg (sum of parent amounts) + change
      expect(payload.outputs).toHaveLength(2);
      
      // First output should be the egg (sum of parent amounts to user's address)
      const expectedEggAmount = parent1Vtxo.amount + parent2Vtxo.amount;
      expect(payload.outputs[0].amount).toBe(expectedEggAmount);
      expect(payload.outputs[0].address).toBe(walletAddress);

      // Second output should be change (payment - fee)
      expect(payload.outputs[1].address).toBe(walletAddress);
      expect(payload.outputs[1].amount).toBeGreaterThan(0);
    });
  });
});

