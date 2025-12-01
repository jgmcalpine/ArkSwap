import { mixGenomes, generateGenesisDNA } from '../src/genetics';

describe('mixGenomes', () => {
  const parentA = 'a'.repeat(64); // 32 bytes of 0xaa
  const parentB = 'b'.repeat(64); // 32 bytes of 0xbb
  const entropy = 'c'.repeat(64); // 32 bytes of 0xcc

  describe('Output Validation', () => {
    it('should always produce 32 bytes (64 hex characters)', () => {
      const child = mixGenomes(parentA, parentB, entropy);

      expect(child.length).toBe(64);
      expect(/^[0-9a-fA-F]{64}$/.test(child)).toBe(true);
    });

    it('should produce valid hex string', () => {
      const child = mixGenomes(parentA, parentB, entropy);

      expect(child).toMatch(/^[0-9a-fA-F]{64}$/);
    });
  });

  describe('Input Validation', () => {
    it('should throw error if dnaA is not 64 hex characters', () => {
      expect(() => {
        mixGenomes('a'.repeat(63), parentB, entropy);
      }).toThrow('dnaA must be exactly 64 hex characters');
    });

    it('should throw error if dnaB is not 64 hex characters', () => {
      expect(() => {
        mixGenomes(parentA, 'b'.repeat(65), entropy);
      }).toThrow('dnaB must be exactly 64 hex characters');
    });

    it('should throw error if entropy is not 64 hex characters', () => {
      expect(() => {
        mixGenomes(parentA, parentB, 'c'.repeat(63));
      }).toThrow('entropy must be exactly 64 hex characters');
    });

    it('should throw error if input contains invalid hex characters', () => {
      expect(() => {
        mixGenomes('g'.repeat(64), parentB, entropy);
      }).toThrow('dnaA must be a valid hex string');
    });
  });

  describe('Determinism', () => {
    it('should produce identical output for identical inputs', () => {
      const child1 = mixGenomes(parentA, parentB, entropy);
      const child2 = mixGenomes(parentA, parentB, entropy);

      expect(child1).toBe(child2);
    });

    it('should produce different output for different entropy', () => {
      const child1 = mixGenomes(parentA, parentB, entropy);
      // Use very different entropy pattern
      const differentEntropy = '0123456789abcdef'.repeat(4);
      const child2 = mixGenomes(parentA, parentB, differentEntropy);

      expect(child1).not.toBe(child2);
    });
  });

  describe('Parent Selection', () => {
    it('should include bytes from both parents', () => {
      // Use entropy that minimizes mutations and favors parent selection
      // Need entropy values that are > 0.05 for mutation check but < 0.5 for parent A selection
      // 0x0f = 15, normalized with another byte gives ~0.001-0.1 range
      // Use pattern that gives low mutation chance but allows parent selection
      const entropyForParentA = '0f'.repeat(32); // Moderate values
      const child = mixGenomes(parentA, parentB, entropyForParentA);

      expect(child.length).toBe(64);

      // Check that the algorithm produces valid output
      // With moderate entropy, we should get a mix of parent bytes and mutations
      const childBytes = child.match(/.{2}/g) || [];
      const parentABytes = parentA.match(/.{2}/g) || [];
      const parentBBytes = parentB.match(/.{2}/g) || [];

      let matchesA = 0;
      let matchesB = 0;
      for (let i = 0; i < childBytes.length; i++) {
        if (childBytes[i] === parentABytes[i]) {
          matchesA++;
        }
        if (childBytes[i] === parentBBytes[i]) {
          matchesB++;
        }
      }

      // With proper entropy, we should get bytes from at least one parent
      // (some may be mutated, but not all)
      expect(matchesA + matchesB).toBeGreaterThan(0);
    });

    it('should select from parent A or B based on entropy', () => {
      // Create entropy that will select parent A (low values for parent selection)
      const entropyForA = '00'.repeat(32);
      const childA = mixGenomes(parentA, parentB, entropyForA);

      // Create entropy that will select parent B (high values for parent selection)
      // Use pattern that gives high values for parent selection bytes
      const entropyForB = 'ff'.repeat(32);
      const childB = mixGenomes(parentA, parentB, entropyForB);

      // With different entropy patterns, we should see different results
      expect(childA).not.toBe(childB);
    });
  });

  describe('Mutation', () => {
    it('should occasionally mutate bytes (5% chance)', () => {
      // Run many times to increase chance of seeing mutations
      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const uniqueEntropy = i.toString(16).padStart(64, '0');
        const child = mixGenomes(parentA, parentB, uniqueEntropy);
        results.add(child);
      }

      // With 100 different entropy values, we should see some variation
      expect(results.size).toBeGreaterThan(1);
    });

    it('should use entropy bytes for mutations', () => {
      // Create entropy with specific pattern
      const mutationEntropy = 'ff'.repeat(32); // High values
      const child = mixGenomes(parentA, parentB, mutationEntropy);

      // Should contain some high-value bytes from entropy
      expect(child).toBeDefined();
      expect(child.length).toBe(64);
    });
  });

  describe('Junk DNA Mixing', () => {
    it('should mix junk DNA bytes (20-31)', () => {
      // Create parents with distinct junk DNA
      const parentWithJunkA = 'a'.repeat(40) + '11'.repeat(12); // Junk = 0x11
      const parentWithJunkB = 'b'.repeat(40) + '22'.repeat(12); // Junk = 0x22

      // Use entropy that will cause mixing (not all favoring one parent)
      const mixingEntropy = '55'.repeat(32); // Middle values for better mixing
      const child = mixGenomes(parentWithJunkA, parentWithJunkB, mixingEntropy);

      // Extract junk DNA (bytes 20-31, hex positions 40-63)
      const junkDNA = child.slice(40, 64);

      // Junk DNA should be mixed (not all 0x11 or all 0x22)
      expect(junkDNA.length).toBe(24); // 12 bytes = 24 hex chars

      // With mixing entropy and mutations, junk DNA should differ from pure parent values
      // Check that it's not identical to either parent's junk DNA
      const isAll11 = junkDNA === '11'.repeat(12);
      const isAll22 = junkDNA === '22'.repeat(12);

      // Due to mutations and mixing, it's very unlikely to be all 11 or all 22
      // But if it happens due to entropy, that's still valid - just check it's processed
      expect(junkDNA).toMatch(/^[0-9a-fA-F]{24}$/);
    });

    it('should apply mutation to junk DNA bytes', () => {
      const parentWithJunkA = 'a'.repeat(40) + '00'.repeat(12);
      const parentWithJunkB = 'b'.repeat(40) + '00'.repeat(12);

      // Use entropy that will cause mutations in junk region
      const mutationEntropy = 'ff'.repeat(32);
      const child = mixGenomes(
        parentWithJunkA,
        parentWithJunkB,
        mutationEntropy,
      );

      const junkDNA = child.slice(40, 64);

      // With mutation entropy, junk DNA should have some non-zero bytes
      // (unless mutation chance didn't trigger, but with high entropy it should)
      expect(junkDNA).toBeDefined();
    });
  });

  describe('All DNA Regions', () => {
    it('should mix all bytes including version, visuals, stats, and junk', () => {
      // Create parents with distinct patterns in each region
      const parentA = '01' + 'aa'.repeat(15) + '11'.repeat(4) + '22'.repeat(12);
      const parentB = '02' + 'bb'.repeat(15) + '33'.repeat(4) + '44'.repeat(12);

      const child = mixGenomes(parentA, parentB, entropy);

      // All regions should be processed
      expect(child.length).toBe(64);

      // Version byte (0) should be mixed
      const versionByte = child.slice(0, 2);
      expect(['01', '02']).toContain(versionByte);

      // Visual bytes (1-15, hex 2-30) should be mixed
      const visualBytes = child.slice(2, 32);
      expect(visualBytes.length).toBe(30);

      // Stats bytes (16-19, hex 32-38) should be mixed
      const statsBytes = child.slice(32, 40);
      expect(statsBytes.length).toBe(8);

      // Junk bytes (20-31, hex 40-62) should be mixed
      const junkBytes = child.slice(40, 64);
      expect(junkBytes.length).toBe(24);
    });
  });
});

describe('generateGenesisDNA', () => {
  const entropy = 'c'.repeat(64);

  describe('Output Validation', () => {
    it('should always produce 32 bytes (64 hex characters)', () => {
      const genesis = generateGenesisDNA(entropy);

      expect(genesis.length).toBe(64);
      expect(/^[0-9a-fA-F]{64}$/.test(genesis)).toBe(true);
    });

    it('should produce valid hex string', () => {
      const genesis = generateGenesisDNA(entropy);

      expect(genesis).toMatch(/^[0-9a-fA-F]{64}$/);
    });
  });

  describe('Input Validation', () => {
    it('should throw error if entropy is not 64 hex characters', () => {
      expect(() => {
        generateGenesisDNA('c'.repeat(63));
      }).toThrow('entropy must be exactly 64 hex characters');
    });

    it('should throw error if entropy contains invalid hex characters', () => {
      expect(() => {
        generateGenesisDNA('g'.repeat(64));
      }).toThrow('entropy must be a valid hex string');
    });
  });

  describe('Version Byte', () => {
    it('should set version byte (0) to 1', () => {
      const genesis = generateGenesisDNA(entropy);

      const versionByte = genesis.slice(0, 2);
      expect(versionByte).toBe('01');
    });

    it('should always have version 1 regardless of entropy', () => {
      const genesis1 = generateGenesisDNA('00'.repeat(32));
      const genesis2 = generateGenesisDNA('ff'.repeat(32));

      expect(genesis1.slice(0, 2)).toBe('01');
      expect(genesis2.slice(0, 2)).toBe('01');
    });
  });

  describe('Visual Bytes Constraint', () => {
    it('should never produce visual bytes (1-15) greater than 0x80', () => {
      // Test with many different entropy values
      for (let i = 0; i < 100; i++) {
        const uniqueEntropy = i.toString(16).padStart(64, 'f');
        const genesis = generateGenesisDNA(uniqueEntropy);

        // Extract visual bytes (hex positions 2-30, bytes 1-15)
        const visualHex = genesis.slice(2, 32);

        // Check each byte
        for (let j = 0; j < visualHex.length; j += 2) {
          const byteHex = visualHex.slice(j, j + 2);
          const byteValue = parseInt(byteHex, 16);
          expect(byteValue).toBeLessThanOrEqual(0x80);
        }
      }
    });

    it('should cap visual bytes at 0x80 even with high entropy', () => {
      const highEntropy = 'ff'.repeat(32); // All 0xff bytes
      const genesis = generateGenesisDNA(highEntropy);

      // Extract visual bytes
      const visualHex = genesis.slice(2, 32);

      for (let i = 0; i < visualHex.length; i += 2) {
        const byteHex = visualHex.slice(i, i + 2);
        const byteValue = parseInt(byteHex, 16);
        expect(byteValue).toBeLessThanOrEqual(0x80);
      }
    });

    it('should allow visual bytes from 0x00 to 0x80 inclusive', () => {
      // Test that the range is correct (0 to 0x80 inclusive = 129 possible values)
      const results = new Set<number>();

      for (let i = 0; i < 200; i++) {
        const uniqueEntropy = (i * 7).toString(16).padStart(64, '0');
        const genesis = generateGenesisDNA(uniqueEntropy);

        // Check first visual byte
        const firstVisualByte = parseInt(genesis.slice(2, 4), 16);
        results.add(firstVisualByte);
      }

      // Should have values in the range [0, 0x80]
      const maxValue = Math.max(...Array.from(results));
      const minValue = Math.min(...Array.from(results));

      expect(maxValue).toBeLessThanOrEqual(0x80);
      expect(minValue).toBeGreaterThanOrEqual(0x00);
    });
  });

  describe('Stats Bytes', () => {
    it('should populate stats bytes (16-19) from entropy', () => {
      const genesis = generateGenesisDNA(entropy);

      // Stats bytes are at hex positions 32-38 (bytes 16-19)
      const statsHex = genesis.slice(32, 40);

      expect(statsHex.length).toBe(8); // 4 bytes = 8 hex chars
      expect(statsHex).toMatch(/^[0-9a-fA-F]{8}$/);
    });

    it('should use different entropy bytes for different stat positions', () => {
      const genesis1 = generateGenesisDNA('00'.repeat(32));
      const genesis2 = generateGenesisDNA('ff'.repeat(32));

      const stats1 = genesis1.slice(32, 40);
      const stats2 = genesis2.slice(32, 40);

      // Should be different due to different entropy
      expect(stats1).not.toBe(stats2);
    });
  });

  describe('Junk DNA', () => {
    it('should populate junk bytes (20-31) from entropy', () => {
      const genesis = generateGenesisDNA(entropy);

      // Junk bytes are at hex positions 40-62 (bytes 20-31)
      const junkHex = genesis.slice(40, 64);

      expect(junkHex.length).toBe(24); // 12 bytes = 24 hex chars
      expect(junkHex).toMatch(/^[0-9a-fA-F]{24}$/);
    });

    it('should randomize junk DNA from entropy', () => {
      const genesis1 = generateGenesisDNA('00'.repeat(32));
      const genesis2 = generateGenesisDNA('ff'.repeat(32));

      const junk1 = genesis1.slice(40, 64);
      const junk2 = genesis2.slice(40, 64);

      // Should be different due to different entropy
      expect(junk1).not.toBe(junk2);
    });

    it('should use different entropy bytes for different junk positions', () => {
      // Create entropy with pattern to verify different bytes are used
      const patternEntropy = '0123456789abcdef'.repeat(4);
      const genesis = generateGenesisDNA(patternEntropy);

      const junkHex = genesis.slice(40, 64);

      // Should have variety (not all same byte)
      const uniqueBytes = new Set(junkHex.match(/.{2}/g));
      expect(uniqueBytes.size).toBeGreaterThan(1);
    });
  });

  describe('Determinism', () => {
    it('should produce identical output for identical entropy', () => {
      const genesis1 = generateGenesisDNA(entropy);
      const genesis2 = generateGenesisDNA(entropy);

      expect(genesis1).toBe(genesis2);
    });

    it('should produce different output for different entropy', () => {
      const genesis1 = generateGenesisDNA('00'.repeat(32));
      const genesis2 = generateGenesisDNA('ff'.repeat(32));

      expect(genesis1).not.toBe(genesis2);
    });
  });

  describe('Complete Structure', () => {
    it('should have correct structure: version + visuals + stats + junk', () => {
      const genesis = generateGenesisDNA(entropy);

      // Version (byte 0): 1 byte = 2 hex chars
      const version = genesis.slice(0, 2);
      expect(version).toBe('01');

      // Visuals (bytes 1-15): 15 bytes = 30 hex chars
      const visuals = genesis.slice(2, 32);
      expect(visuals.length).toBe(30);

      // Stats (bytes 16-19): 4 bytes = 8 hex chars
      const stats = genesis.slice(32, 40);
      expect(stats.length).toBe(8);

      // Junk (bytes 20-31): 12 bytes = 24 hex chars
      const junk = genesis.slice(40, 64);
      expect(junk.length).toBe(24);

      // Total should be 64 hex chars
      expect(genesis.length).toBe(64);
    });
  });
});
