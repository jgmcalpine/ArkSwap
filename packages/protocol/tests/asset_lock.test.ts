import { createAssetLock, SwapLockParams, getAssetHash } from '../src/script';
import type { AssetMetadata } from '../src/index';
import * as bitcoin from 'bitcoinjs-lib';

describe('createAssetLock', () => {
  // Test fixtures - 32-byte buffers
  const makerPubkey = Buffer.from('a'.repeat(64), 'hex'); // 32 bytes
  const userPubkey = Buffer.from('b'.repeat(64), 'hex'); // 32 bytes
  const preimageHash = Buffer.from('c'.repeat(64), 'hex'); // 32 bytes
  const timeoutBlocks = 10;

  const defaultParams: SwapLockParams = {
    makerPubkey,
    userPubkey,
    preimageHash,
    timeoutBlocks,
  };

  const defaultMetadata: AssetMetadata = {
    dna: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as any,
    generation: 0,
    cooldownBlock: 100,
    lastFedBlock: 50,
    xp: 0,
  };

  describe('Test 1: Validity - Valid Taproot Address', () => {
    it('should generate a valid Taproot address starting with bcrt1p', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);

      expect(result.address).toBeDefined();
      expect(typeof result.address).toBe('string');
      expect(result.address).toMatch(/^bcrt1p/);
      expect(result.address.length).toBeGreaterThan(0);
    });

    it('should return a valid output script buffer', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);

      expect(result.output).toBeInstanceOf(Buffer);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it('should return control blocks for both paths', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);

      expect(result.controlBlock).toBeInstanceOf(Buffer);
      expect(result.controlBlockRefund).toBeInstanceOf(Buffer);
      expect(result.controlBlock.length).toBeGreaterThan(0);
      expect(result.controlBlockRefund.length).toBeGreaterThan(0);
    });

    it('should return compiled scripts for both leaves', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);

      expect(result.leaves.claim).toBeInstanceOf(Buffer);
      expect(result.leaves.refund).toBeInstanceOf(Buffer);
      expect(result.leaves.claim.length).toBeGreaterThan(0);
      expect(result.leaves.refund.length).toBeGreaterThan(0);
    });
  });

  describe('Test 2: Determinism', () => {
    it('should produce the exact same address for identical params and metadata', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);
      const result2 = createAssetLock(defaultParams, defaultMetadata);

      expect(result1.address).toBe(result2.address);
      expect(result1.output).toEqual(result2.output);
      expect(result1.controlBlock).toEqual(result2.controlBlock);
      expect(result1.controlBlockRefund).toEqual(result2.controlBlockRefund);
      expect(result1.leaves.claim).toEqual(result2.leaves.claim);
      expect(result1.leaves.refund).toEqual(result2.leaves.refund);
    });

    it('should produce identical results across multiple calls', () => {
      const results = Array.from({ length: 10 }, () =>
        createAssetLock(defaultParams, defaultMetadata),
      );

      const firstAddress = results[0].address;
      results.forEach((result) => {
        expect(result.address).toBe(firstAddress);
      });
    });

    it('should produce same hash for identical metadata', () => {
      const hash1 = getAssetHash(defaultMetadata);
      const hash2 = getAssetHash(defaultMetadata);

      expect(hash1).toEqual(hash2);
      expect(hash1.length).toBe(32);
    });
  });

  describe('Test 3: Sensitivity - Different Metadata Produces Different Addresses', () => {
    it('should produce different address when DNA changes', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        dna: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' as any,
      };

      const result2 = createAssetLock(defaultParams, differentMetadata);

      expect(result1.address).not.toBe(result2.address);
      expect(result1.output).not.toEqual(result2.output);
    });

    it('should produce different address when generation changes', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        generation: 1,
      };

      const result2 = createAssetLock(defaultParams, differentMetadata);

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce different address when cooldownBlock changes', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        cooldownBlock: 200,
      };

      const result2 = createAssetLock(defaultParams, differentMetadata);

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce the same address when lastFedBlock changes (mutable field)', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        lastFedBlock: 100,
      };

      const result2 = createAssetLock(defaultParams, differentMetadata);

      // lastFedBlock is a mutable field (changes when feeding), so it should NOT affect the address
      // The address should remain stable even after feeding
      expect(result1.address).toBe(result2.address);
    });

    it('should produce the same address when xp changes (mutable field)', () => {
      const result1 = createAssetLock(defaultParams, defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        xp: 100,
      };

      const result2 = createAssetLock(defaultParams, differentMetadata);

      // xp is a mutable field (changes when feeding), so it should NOT affect the address
      // The address should remain stable even after feeding
      expect(result1.address).toBe(result2.address);
    });

    it('should produce different address when parents array changes', () => {
      const metadataWithoutParents: AssetMetadata = {
        ...defaultMetadata,
      };
      delete metadataWithoutParents.parents;

      const result1 = createAssetLock(defaultParams, metadataWithoutParents);

      const metadataWithParents: AssetMetadata = {
        ...defaultMetadata,
        parents: ['a'.repeat(64), 'b'.repeat(64)],
      };

      const result2 = createAssetLock(defaultParams, metadataWithParents);

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce different hash for different metadata', () => {
      const hash1 = getAssetHash(defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        generation: 1,
      };
      const hash2 = getAssetHash(differentMetadata);

      expect(hash1).not.toEqual(hash2);
    });

    it('should produce different addresses for "Gold Koi" vs "Red Koi" (different DNA)', () => {
      const goldKoiMetadata: AssetMetadata = {
        dna: 'a'.repeat(64) as any,
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      const redKoiMetadata: AssetMetadata = {
        dna: 'b'.repeat(64) as any,
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      const goldKoiResult = createAssetLock(defaultParams, goldKoiMetadata);
      const redKoiResult = createAssetLock(defaultParams, redKoiMetadata);

      expect(goldKoiResult.address).not.toBe(redKoiResult.address);
    });
  });

  describe('Test 4: Same Params, Different Metadata = Different Address', () => {
    it('should produce different address even with same swap params but different metadata', () => {
      const metadata1: AssetMetadata = {
        dna: '1111111111111111111111111111111111111111111111111111111111111111' as any,
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      const metadata2: AssetMetadata = {
        dna: '2222222222222222222222222222222222222222222222222222222222222222' as any,
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
      };

      const result1 = createAssetLock(defaultParams, metadata1);
      const result2 = createAssetLock(defaultParams, metadata2);

      expect(result1.address).not.toBe(result2.address);
      expect(result1.output).not.toEqual(result2.output);
    });
  });

  describe('Test 5: Input Validation', () => {
    it('should throw error if makerPubkey is not 32 bytes', () => {
      expect(() => {
        createAssetLock(
          {
            ...defaultParams,
            makerPubkey: Buffer.alloc(31),
          },
          defaultMetadata,
        );
      }).toThrow('makerPubkey must be 32 bytes');
    });

    it('should throw error if userPubkey is not 32 bytes', () => {
      expect(() => {
        createAssetLock(
          {
            ...defaultParams,
            userPubkey: Buffer.alloc(33),
          },
          defaultMetadata,
        );
      }).toThrow('userPubkey must be 32 bytes');
    });

    it('should throw error if preimageHash is not 32 bytes', () => {
      expect(() => {
        createAssetLock(
          {
            ...defaultParams,
            preimageHash: Buffer.alloc(31),
          },
          defaultMetadata,
        );
      }).toThrow('preimageHash must be 32 bytes');
    });

    it('should throw error if timeoutBlocks is less than 1', () => {
      expect(() => {
        createAssetLock(
          {
            ...defaultParams,
            timeoutBlocks: 0,
          },
          defaultMetadata,
        );
      }).toThrow('timeoutBlocks must be between 1 and 0xffffffff');
    });

    it('should throw error if timeoutBlocks is too large', () => {
      expect(() => {
        createAssetLock(
          {
            ...defaultParams,
            timeoutBlocks: 0x100000000, // 2^32
          },
          defaultMetadata,
        );
      }).toThrow('timeoutBlocks must be between 1 and 0xffffffff');
    });
  });

  describe('Test 6: Script Structure', () => {
    it('should contain OP_SHA256 in the claim script', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);
      const claimScriptAsm = bitcoin.script.toASM(result.leaves.claim);

      expect(claimScriptAsm).toContain('OP_SHA256');
    });

    it('should contain OP_CHECKSEQUENCEVERIFY in the refund script', () => {
      const result = createAssetLock(defaultParams, defaultMetadata);
      const refundScriptAsm = bitcoin.script.toASM(result.leaves.refund);

      expect(refundScriptAsm).toContain('OP_CHECKSEQUENCEVERIFY');
    });
  });

  describe('Test 7: getAssetHash', () => {
    it('should produce deterministic hashes', () => {
      const hash1 = getAssetHash(defaultMetadata);
      const hash2 = getAssetHash(defaultMetadata);

      expect(hash1).toEqual(hash2);
    });

    it('should produce 32-byte hashes', () => {
      const hash = getAssetHash(defaultMetadata);

      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32);
    });

    it('should produce different hashes for different metadata', () => {
      const hash1 = getAssetHash(defaultMetadata);

      const differentMetadata: AssetMetadata = {
        ...defaultMetadata,
        generation: 5,
      };
      const hash2 = getAssetHash(differentMetadata);

      expect(hash1).not.toEqual(hash2);
    });

    it('should normalize parents field: undefined and [] produce same hash', () => {
      const metadataWithoutParents: AssetMetadata = {
        ...defaultMetadata,
      };
      delete metadataWithoutParents.parents;

      const metadataWithEmptyParents: AssetMetadata = {
        ...defaultMetadata,
        parents: [],
      };

      const hash1 = getAssetHash(metadataWithoutParents);
      const hash2 = getAssetHash(metadataWithEmptyParents);

      // These should be the same because undefined is normalized to []
      expect(hash1).toEqual(hash2);
    });
  });
});
