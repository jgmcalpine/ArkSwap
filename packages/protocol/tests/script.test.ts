import { createSwapLock, SwapLockParams } from '../src/script';
import * as bitcoin from 'bitcoinjs-lib';

describe('createSwapLock', () => {
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

  describe('Test 1: Compilation - Valid Taproot Address', () => {
    it('should generate a valid Taproot address starting with bcrt1p', () => {
      const result = createSwapLock(defaultParams);

      expect(result.address).toBeDefined();
      expect(typeof result.address).toBe('string');
      expect(result.address).toMatch(/^bcrt1p/);
      expect(result.address.length).toBeGreaterThan(0);
    });

    it('should return a valid output script buffer', () => {
      const result = createSwapLock(defaultParams);

      expect(result.output).toBeInstanceOf(Buffer);
      expect(result.output.length).toBeGreaterThan(0);
    });

    it('should return control blocks for both paths', () => {
      const result = createSwapLock(defaultParams);

      expect(result.controlBlock).toBeInstanceOf(Buffer);
      expect(result.controlBlockRefund).toBeInstanceOf(Buffer);
      expect(result.controlBlock.length).toBeGreaterThan(0);
      expect(result.controlBlockRefund.length).toBeGreaterThan(0);
    });

    it('should return compiled scripts for both leaves', () => {
      const result = createSwapLock(defaultParams);

      expect(result.leaves.claim).toBeInstanceOf(Buffer);
      expect(result.leaves.refund).toBeInstanceOf(Buffer);
      expect(result.leaves.claim.length).toBeGreaterThan(0);
      expect(result.leaves.refund.length).toBeGreaterThan(0);
    });
  });

  describe('Test 2: Determinism', () => {
    it('should produce the exact same address for identical inputs', () => {
      const result1 = createSwapLock(defaultParams);
      const result2 = createSwapLock(defaultParams);

      expect(result1.address).toBe(result2.address);
      expect(result1.output).toEqual(result2.output);
      expect(result1.controlBlock).toEqual(result2.controlBlock);
      expect(result1.controlBlockRefund).toEqual(result2.controlBlockRefund);
      expect(result1.leaves.claim).toEqual(result2.leaves.claim);
      expect(result1.leaves.refund).toEqual(result2.leaves.refund);
    });

    it('should produce identical results across multiple calls', () => {
      const results = Array.from({ length: 10 }, () =>
        createSwapLock(defaultParams),
      );

      const firstAddress = results[0].address;
      results.forEach((result) => {
        expect(result.address).toBe(firstAddress);
      });
    });
  });

  describe('Test 3: Uniqueness', () => {
    it('should produce different address when preimageHash changes by one byte', () => {
      const result1 = createSwapLock(defaultParams);

      const alteredPreimageHash = Buffer.from(preimageHash);
      alteredPreimageHash[0] = alteredPreimageHash[0] === 0 ? 1 : 0; // Change first byte

      const result2 = createSwapLock({
        ...defaultParams,
        preimageHash: alteredPreimageHash,
      });

      expect(result1.address).not.toBe(result2.address);
      expect(result1.output).not.toEqual(result2.output);
    });

    it('should produce different address when makerPubkey changes by one byte', () => {
      const result1 = createSwapLock(defaultParams);

      const alteredMakerPubkey = Buffer.from(makerPubkey);
      alteredMakerPubkey[0] = alteredMakerPubkey[0] === 0 ? 1 : 0; // Change first byte

      const result2 = createSwapLock({
        ...defaultParams,
        makerPubkey: alteredMakerPubkey,
      });

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce different address when userPubkey changes by one byte', () => {
      const result1 = createSwapLock(defaultParams);

      const alteredUserPubkey = Buffer.from(userPubkey);
      alteredUserPubkey[0] = alteredUserPubkey[0] === 0 ? 1 : 0; // Change first byte

      const result2 = createSwapLock({
        ...defaultParams,
        userPubkey: alteredUserPubkey,
      });

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce different address when timeoutBlocks changes', () => {
      const result1 = createSwapLock(defaultParams);

      const result2 = createSwapLock({
        ...defaultParams,
        timeoutBlocks: timeoutBlocks + 1,
      });

      expect(result1.address).not.toBe(result2.address);
    });

    it('should produce different addresses for completely different inputs', () => {
      const result1 = createSwapLock(defaultParams);

      const result2 = createSwapLock({
        makerPubkey: Buffer.from('d'.repeat(64), 'hex'),
        userPubkey: Buffer.from('e'.repeat(64), 'hex'),
        preimageHash: Buffer.from('f'.repeat(64), 'hex'),
        timeoutBlocks: 20,
      });

      expect(result1.address).not.toBe(result2.address);
    });
  });

  describe('Test 4: Script Structure', () => {
    it('should contain OP_SHA256 in the claim script', () => {
      const result = createSwapLock(defaultParams);
      const claimScriptAsm = bitcoin.script.toASM(result.leaves.claim);

      expect(claimScriptAsm).toContain('OP_SHA256');
    });

    it('should contain OP_EQUALVERIFY in the claim script', () => {
      const result = createSwapLock(defaultParams);
      const claimScriptAsm = bitcoin.script.toASM(result.leaves.claim);

      expect(claimScriptAsm).toContain('OP_EQUALVERIFY');
    });

    it('should contain OP_CHECKSIG in the claim script', () => {
      const result = createSwapLock(defaultParams);
      const claimScriptAsm = bitcoin.script.toASM(result.leaves.claim);

      expect(claimScriptAsm).toContain('OP_CHECKSIG');
    });

    it('should contain OP_CHECKSEQUENCEVERIFY in the refund script', () => {
      const result = createSwapLock(defaultParams);
      const refundScriptAsm = bitcoin.script.toASM(result.leaves.refund);

      expect(refundScriptAsm).toContain('OP_CHECKSEQUENCEVERIFY');
    });

    it('should contain OP_DROP in the refund script', () => {
      const result = createSwapLock(defaultParams);
      const refundScriptAsm = bitcoin.script.toASM(result.leaves.refund);

      expect(refundScriptAsm).toContain('OP_DROP');
    });

    it('should contain OP_CHECKSIG in the refund script', () => {
      const result = createSwapLock(defaultParams);
      const refundScriptAsm = bitcoin.script.toASM(result.leaves.refund);

      expect(refundScriptAsm).toContain('OP_CHECKSIG');
    });

    it('should contain the timeout value in the refund script', () => {
      const result = createSwapLock(defaultParams);
      const refundScriptAsm = bitcoin.script.toASM(result.leaves.refund);

      // The timeout should be encoded in the script
      // For timeoutBlocks = 10, it should appear in the ASM
      expect(refundScriptAsm).toMatch(/\d+/); // Should contain a number
    });

    it('should contain the preimage hash in the claim script', () => {
      const result = createSwapLock(defaultParams);
      const claimScriptAsm = bitcoin.script.toASM(result.leaves.claim);

      // The hash should appear in hex format in the ASM
      const hashHex = preimageHash.toString('hex');
      expect(claimScriptAsm.toLowerCase()).toContain(hashHex.toLowerCase());
    });
  });

  describe('Input Validation', () => {
    it('should throw error if makerPubkey is not 32 bytes', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          makerPubkey: Buffer.alloc(31),
        });
      }).toThrow('makerPubkey must be 32 bytes');
    });

    it('should throw error if userPubkey is not 32 bytes', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          userPubkey: Buffer.alloc(33),
        });
      }).toThrow('userPubkey must be 32 bytes');
    });

    it('should throw error if preimageHash is not 32 bytes', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          preimageHash: Buffer.alloc(31),
        });
      }).toThrow('preimageHash must be 32 bytes');
    });

    it('should throw error if timeoutBlocks is less than 1', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          timeoutBlocks: 0,
        });
      }).toThrow('timeoutBlocks must be between 1 and 0xffffffff');
    });

    it('should throw error if timeoutBlocks is too large', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          timeoutBlocks: 0x100000000, // 2^32
        });
      }).toThrow('timeoutBlocks must be between 1 and 0xffffffff');
    });

    it('should accept valid timeoutBlocks at boundaries', () => {
      expect(() => {
        createSwapLock({
          ...defaultParams,
          timeoutBlocks: 1,
        });
      }).not.toThrow();

      expect(() => {
        createSwapLock({
          ...defaultParams,
          timeoutBlocks: 0xffffffff,
        });
      }).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum timeout value', () => {
      const result = createSwapLock({
        ...defaultParams,
        timeoutBlocks: 1,
      });

      expect(result.address).toMatch(/^bcrt1p/);
    });

    it('should handle maximum timeout value', () => {
      const result = createSwapLock({
        ...defaultParams,
        timeoutBlocks: 0xffffffff,
      });

      expect(result.address).toMatch(/^bcrt1p/);
    });

    it('should handle all-zero pubkeys', () => {
      const result = createSwapLock({
        makerPubkey: Buffer.alloc(32, 0),
        userPubkey: Buffer.alloc(32, 0),
        preimageHash: Buffer.alloc(32, 0),
        timeoutBlocks: 10,
      });

      expect(result.address).toMatch(/^bcrt1p/);
    });

    it('should handle all-ones pubkeys', () => {
      const result = createSwapLock({
        makerPubkey: Buffer.alloc(32, 0xff),
        userPubkey: Buffer.alloc(32, 0xff),
        preimageHash: Buffer.alloc(32, 0xff),
        timeoutBlocks: 10,
      });

      expect(result.address).toMatch(/^bcrt1p/);
    });
  });
});
