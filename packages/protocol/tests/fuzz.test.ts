import * as fc from 'fast-check';
import { createSwapLock, SwapLockParams } from '../src/script';

describe('Fuzz Testing: createSwapLock', () => {
  // Define arbitraries for property-based testing
  const anyBytes32 = fc.uint8Array({ minLength: 32, maxLength: 32 });
  const validTimeout = fc.integer({ min: 1, max: 0xffffffff });

  describe('Property 1: Determinism', () => {
    it('should produce identical results for the same inputs', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            // Convert Uint8Array to Buffer
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            // Call createSwapLock twice with the same inputs
            const result1 = createSwapLock(params);
            const result2 = createSwapLock(params);

            // Assert exact equality
            expect(result1.address).toBe(result2.address);
            expect(result1.output).toEqual(result2.output);
            expect(result1.controlBlock).toEqual(result2.controlBlock);
            expect(result1.controlBlockRefund).toEqual(
              result2.controlBlockRefund,
            );
            expect(result1.leaves.claim).toEqual(result2.leaves.claim);
            expect(result1.leaves.refund).toEqual(result2.leaves.refund);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 2: Output Validity', () => {
    it('should always produce a valid regtest Taproot address and output', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            // Convert Uint8Array to Buffer
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            const result = createSwapLock(params);

            // Assert address starts with bcrt1p (Regtest Taproot)
            expect(result.address).toMatch(/^bcrt1p/);

            // Assert output is exactly 34 bytes (standard Taproot output length)
            expect(result.output.length).toBe(34);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Property 3: Crash Resistance (Invalid Inputs)', () => {
    it('should throw error for invalid makerPubkey length (31 bytes)', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 31, maxLength: 31 }),
          anyBytes32,
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'makerPubkey must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid makerPubkey length (33 bytes)', () => {
      fc.assert(
        fc.property(
          fc.uint8Array({ minLength: 33, maxLength: 33 }),
          anyBytes32,
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'makerPubkey must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid userPubkey length (31 bytes)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          fc.uint8Array({ minLength: 31, maxLength: 31 }),
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'userPubkey must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid userPubkey length (33 bytes)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          fc.uint8Array({ minLength: 33, maxLength: 33 }),
          anyBytes32,
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'userPubkey must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid preimageHash length (31 bytes)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          fc.uint8Array({ minLength: 31, maxLength: 31 }),
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'preimageHash must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid preimageHash length (33 bytes)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          fc.uint8Array({ minLength: 33, maxLength: 33 }),
          validTimeout,
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'preimageHash must be 32 bytes',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid timeoutBlocks (less than 1)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          anyBytes32,
          fc.integer({ min: Number.MIN_SAFE_INTEGER, max: 0 }),
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'timeoutBlocks must be between 1 and 0xffffffff',
            );
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should throw error for invalid timeoutBlocks (greater than 0xffffffff)', () => {
      fc.assert(
        fc.property(
          anyBytes32,
          anyBytes32,
          anyBytes32,
          fc.integer({ min: 0x100000000, max: Number.MAX_SAFE_INTEGER }),
          (
            makerPubkeyBytes,
            userPubkeyBytes,
            preimageHashBytes,
            timeoutBlocks,
          ) => {
            const makerPubkey = Buffer.from(makerPubkeyBytes);
            const userPubkey = Buffer.from(userPubkeyBytes);
            const preimageHash = Buffer.from(preimageHashBytes);

            const params: SwapLockParams = {
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks,
            };

            expect(() => createSwapLock(params)).toThrow(
              'timeoutBlocks must be between 1 and 0xffffffff',
            );
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
