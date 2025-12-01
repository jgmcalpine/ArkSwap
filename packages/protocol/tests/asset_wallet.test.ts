import { createAssetPayToPublicKey } from '../src/script';
import type { AssetMetadata } from '../src/index';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import ecc from '@bitcoinerlab/secp256k1';

// Initialize ECC library
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

describe('createAssetPayToPublicKey', () => {
  // Generate valid x-only pubkeys from keypairs
  const keyPair1 = ECPair.makeRandom({ network: bitcoin.networks.regtest });
  const keyPair2 = ECPair.makeRandom({ network: bitcoin.networks.regtest });
  const userPubkey1 = keyPair1.publicKey.slice(1, 33); // x-only pubkey (32 bytes)
  const userPubkey2 = keyPair2.publicKey.slice(1, 33); // x-only pubkey (32 bytes)

  const defaultMetadata: AssetMetadata = {
    dna: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as any,
    generation: 0,
    cooldownBlock: 100,
    lastFedBlock: 50,
    xp: 0,
    parents: [],
  };

  describe('Test 1: Validity - Valid Taproot Address', () => {
    it('should generate a valid Taproot address starting with bcrt1p', () => {
      const address = createAssetPayToPublicKey(userPubkey1, defaultMetadata);

      expect(address).toBeDefined();
      expect(typeof address).toBe('string');
      expect(address).toMatch(/^bcrt1p/);
      expect(address.length).toBeGreaterThan(0);
    });
  });

  describe('Test 2: Determinism - Same Key + Same DNA = Same Address', () => {
    it('should produce the exact same address for identical pubkey and metadata', () => {
      const address1 = createAssetPayToPublicKey(userPubkey1, defaultMetadata);
      const address2 = createAssetPayToPublicKey(userPubkey1, defaultMetadata);

      expect(address1).toBe(address2);
    });

    it('should produce identical results across multiple calls', () => {
      const addresses = Array.from({ length: 10 }, () =>
        createAssetPayToPublicKey(userPubkey1, defaultMetadata),
      );

      const firstAddress = addresses[0];
      addresses.forEach((address) => {
        expect(address).toBe(firstAddress);
      });
    });

    it('should produce same address when all metadata fields are identical', () => {
      const metadata1: AssetMetadata = {
        ...defaultMetadata,
        generation: 0,
        cooldownBlock: 100,
        xp: 0,
      };

      const metadata2: AssetMetadata = {
        ...defaultMetadata,
        generation: 0,
        cooldownBlock: 100,
        xp: 0,
      };

      // Since all fields are identical, the address should be the same
      const address1 = createAssetPayToPublicKey(userPubkey1, metadata1);
      const address2 = createAssetPayToPublicKey(userPubkey1, metadata2);

      expect(address1).toBe(address2);
    });
  });

  describe('Test 3: Sensitivity - Change DNA = Change Address', () => {
    it('should produce different address when DNA changes', () => {
      const address1 = createAssetPayToPublicKey(userPubkey1, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        dna: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as any,
      };

      const address2 = createAssetPayToPublicKey(
        userPubkey1,
        differentMetadata,
      );

      expect(address1).not.toBe(address2);
    });

    it('should produce different address when pubkey changes', () => {
      const address1 = createAssetPayToPublicKey(userPubkey1, defaultMetadata);
      const address2 = createAssetPayToPublicKey(userPubkey2, defaultMetadata);

      expect(address1).not.toBe(address2);
    });

    it('should produce different address when both pubkey and DNA change', () => {
      const address1 = createAssetPayToPublicKey(userPubkey1, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        dna: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as any,
      };

      const address2 = createAssetPayToPublicKey(
        userPubkey2,
        differentMetadata,
      );

      expect(address1).not.toBe(address2);
    });
  });

  describe('Test 4: Validation', () => {
    it('should throw error if userPubkey is not 32 bytes', () => {
      const invalidPubkey = Buffer.from('a'.repeat(66), 'hex'); // 33 bytes

      expect(() => {
        createAssetPayToPublicKey(invalidPubkey, defaultMetadata);
      }).toThrow('userPubkey must be 32 bytes');
    });

    it('should throw error if userPubkey is too short', () => {
      const invalidPubkey = Buffer.from('a'.repeat(62), 'hex'); // 31 bytes

      expect(() => {
        createAssetPayToPublicKey(invalidPubkey, defaultMetadata);
      }).toThrow('userPubkey must be 32 bytes');
    });
  });
});
