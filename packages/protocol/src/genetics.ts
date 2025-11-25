import type { Genome } from './index';
import { asGenome } from './index';

/**
 * DNA Structure (32 bytes = 64 hex characters):
 * - Byte 0: Version
 * - Bytes 1-15: Visuals (15 bytes)
 * - Bytes 16-19: Stats (4 bytes)
 * - Bytes 20-31: Junk (12 bytes)
 */

const DNA_LENGTH_BYTES = 32;
const DNA_LENGTH_HEX = 64;
const MUTATION_CHANCE = 0.05; // 5%
const GENESIS_VISUAL_MAX = 0x80; // Cap for Gen 0 visual bytes

/**
 * Validates that a hex string is exactly 32 bytes (64 hex characters)
 */
function validateHexLength(hex: string, name: string): void {
  if (hex.length !== DNA_LENGTH_HEX) {
    throw new Error(`${name} must be exactly ${DNA_LENGTH_HEX} hex characters (32 bytes)`);
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`${name} must be a valid hex string`);
  }
}

/**
 * Extracts a byte from a hex string at a given position
 */
function getByteAt(hex: string, byteIndex: number): number {
  const hexIndex = byteIndex * 2;
  return parseInt(hex.slice(hexIndex, hexIndex + 2), 16);
}

/**
 * Sets a byte in a hex string at a given position
 */
function setByteAt(hex: string, byteIndex: number, value: number): string {
  const hexIndex = byteIndex * 2;
  const hexByte = value.toString(16).padStart(2, '0');
  return hex.slice(0, hexIndex) + hexByte + hex.slice(hexIndex + 2);
}

/**
 * Gets a deterministic random value from entropy for a given byte position
 * Uses entropy bytes to create a pseudo-random value between 0 and 1
 * Uses a prime-based offset to ensure different bytes are used for different purposes
 */
function getEntropyValue(entropy: string, byteIndex: number, offset: number = 0): number {
  // Use different entropy positions based on offset to ensure independence
  const entropyPos1 = (byteIndex * 3 + offset) % DNA_LENGTH_BYTES;
  const entropyPos2 = (byteIndex * 3 + offset + 1) % DNA_LENGTH_BYTES;
  const entropyByte1 = getByteAt(entropy, entropyPos1);
  const entropyByte2 = getByteAt(entropy, entropyPos2);
  // Combine two bytes for better distribution
  const combined = (entropyByte1 << 8) | entropyByte2;
  return combined / 0xffff; // Normalize to 0-1
}

/**
 * Gets a random byte from entropy for a given byte position
 */
function getEntropyByte(entropy: string, byteIndex: number): number {
  // Use different entropy bytes for different positions to ensure variety
  const entropyIndex = (byteIndex * 7) % DNA_LENGTH_BYTES; // Use prime multiplier for better distribution
  return getByteAt(entropy, entropyIndex);
}

/**
 * Mixes two parent genomes to create a child genome
 * 
 * Algorithm:
 * - For each byte position (0-31):
 *   - 50% chance to take from parent A
 *   - 50% chance to take from parent B
 *   - 5% mutation chance (based on entropy) to replace with random value from entropy
 * 
 * @param dnaA - Parent A's DNA (64 hex characters)
 * @param dnaB - Parent B's DNA (64 hex characters)
 * @param entropy - Random hex string (64 hex characters) for deterministic randomness
 * @returns Child DNA (64 hex characters)
 */
export function mixGenomes(dnaA: string, dnaB: string, entropy: string): Genome {
  validateHexLength(dnaA, 'dnaA');
  validateHexLength(dnaB, 'dnaB');
  validateHexLength(entropy, 'entropy');

  let childDna = '0'.repeat(DNA_LENGTH_HEX);

  for (let byteIndex = 0; byteIndex < DNA_LENGTH_BYTES; byteIndex++) {
    // Use different entropy bytes for mutation check vs parent selection
    // Offset 0 for mutation, offset 17 (prime) for parent selection to ensure independence
    const mutationRoll = getEntropyValue(entropy, byteIndex, 0);
    
    // 5% mutation chance
    if (mutationRoll < MUTATION_CHANCE) {
      // Mutation: use random byte from entropy
      const mutatedByte = getEntropyByte(entropy, byteIndex);
      childDna = setByteAt(childDna, byteIndex, mutatedByte);
    } else {
      // No mutation: choose between parent A or B
      // Use different entropy bytes for parent selection (50/50 split)
      const parentRoll = getEntropyValue(entropy, byteIndex, 17);
      const sourceByte = parentRoll < 0.5 
        ? getByteAt(dnaA, byteIndex)
        : getByteAt(dnaB, byteIndex);
      childDna = setByteAt(childDna, byteIndex, sourceByte);
    }
  }

  return asGenome(childDna);
}

/**
 * Generates a Genesis DNA (Generation 0)
 * 
 * Rules:
 * - Version byte (0) = 1
 * - Visual bytes (1-15) are capped at 0x80 for Gen 0 limits
 * - Stats bytes (16-19) are random from entropy
 * - Junk bytes (20-31) are random from entropy
 * 
 * @param entropy - Random hex string (64 hex characters) for deterministic randomness
 * @returns Genesis DNA (64 hex characters)
 */
export function generateGenesisDNA(entropy: string): Genome {
  validateHexLength(entropy, 'entropy');

  let genesisDna = '0'.repeat(DNA_LENGTH_HEX);

  // Byte 0: Version = 1
  genesisDna = setByteAt(genesisDna, 0, 1);

  // Bytes 1-15: Visuals (capped at 0x80)
  for (let byteIndex = 1; byteIndex <= 15; byteIndex++) {
    const entropyByte = getEntropyByte(entropy, byteIndex);
    const cappedByte = entropyByte % (GENESIS_VISUAL_MAX + 1); // 0 to 0x80 inclusive
    genesisDna = setByteAt(genesisDna, byteIndex, cappedByte);
  }

  // Bytes 16-19: Stats (random from entropy)
  for (let byteIndex = 16; byteIndex <= 19; byteIndex++) {
    const entropyByte = getEntropyByte(entropy, byteIndex);
    genesisDna = setByteAt(genesisDna, byteIndex, entropyByte);
  }

  // Bytes 20-31: Junk (random from entropy)
  for (let byteIndex = 20; byteIndex <= 31; byteIndex++) {
    const entropyByte = getEntropyByte(entropy, byteIndex);
    genesisDna = setByteAt(genesisDna, byteIndex, entropyByte);
  }

  return asGenome(genesisDna);
}

