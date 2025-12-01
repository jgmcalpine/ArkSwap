'use client';

import { useMemo } from 'react';
import { getBodyColor, getEyeTrait } from '../lib/koi-traits';

export type KoiPatternType = 'Circuit' | 'Hex' | 'Stripes' | 'None';
export type KoiFinShape = 'Tech' | 'Organic';
export type KoiEyeType = 'Sensor' | 'Visor' | 'Pixel' | 'Crosshair';
export type KoiRarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export interface DnaTraits {
  readonly colorName: string;
  readonly accentName: string;
  readonly pattern: KoiPatternType;
  readonly finShape: KoiFinShape;
  readonly eyeType: KoiEyeType;
  readonly rarity: KoiRarity;
  readonly fertility: 'Low' | 'Medium' | 'High';
  readonly symmetry: {
    readonly value: number;
    readonly label: 'Chaotic' | 'Perfect';
    readonly percentage: number;
  };
}

const BYTE_MAX = 255;

const getRarityFromByte = (value: number): KoiRarity => {
  if (value < 128) {
    return 'Common';
  }
  if (value < 192) {
    return 'Rare';
  }
  if (value < 224) {
    return 'Epic';
  }
  return 'Legendary';
};

const getFertilityFromByte = (value: number): 'Low' | 'Medium' | 'High' => {
  if (value < BYTE_MAX * 0.33) {
    return 'Low';
  }
  if (value < BYTE_MAX * 0.66) {
    return 'Medium';
  }
  return 'High';
};

const getPatternFromByte = (value: number): KoiPatternType => {
  const index = value % 4;
  if (index === 0) {
    return 'Circuit';
  }
  if (index === 1) {
    return 'Hex';
  }
  if (index === 2) {
    return 'Stripes';
  }
  return 'None';
};

const getFinShapeFromByte = (value: number): KoiFinShape => {
  return value % 2 === 0 ? 'Tech' : 'Organic';
};

const normaliseDna = (dna: string): string => {
  const trimmed = dna.trim().toLowerCase().replace(/^0x/, '');
  if (trimmed.length >= 64) {
    return trimmed.slice(0, 64);
  }
  return trimmed.padEnd(64, '0');
};

const hexToBytes = (hex: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const slice = hex.slice(i, i + 2);
    bytes.push(Number.parseInt(slice, 16));
  }
  return bytes;
};

export const parseDna = (dna: string | null | undefined): DnaTraits | null => {
  if (!dna) {
    return null;
  }

  const normalised = normaliseDna(dna);
  const bytes = hexToBytes(normalised);

  if (bytes.length < 12) {
    return null;
  }

  // Use shared functions to ensure visual-text sync
  // Note: Byte 0 is version (always 1 for Gen 0), Byte 1 is first visual byte
  // For Gen 0, visual bytes (1-15) are capped at 0x80 (128)
  const bodyColor = getBodyColor(bytes[1] ?? 0);
  const eyeTrait = getEyeTrait(bytes[8] ?? 0);

  // Accent color name (for display purposes, derived from byte 2)
  const accentHue = ((bytes[2] ?? 0) / BYTE_MAX) * 360;
  const accentName = getAccentColorName(accentHue);

  const pattern = getPatternFromByte(bytes[6] ?? 0);
  const finShape = getFinShapeFromByte(bytes[7] ?? 0);
  // Map eye trait type to KoiEyeType (capitalized for display)
  const eyeType: KoiEyeType = eyeTrait.name as KoiEyeType;

  const rarityByte = bytes[10] ?? bytes[3] ?? 0;
  const fertilityByte = bytes[11] ?? bytes[4] ?? 0;

  const rarity = getRarityFromByte(rarityByte);
  const fertility = getFertilityFromByte(fertilityByte);

  // Symmetry from Byte 10 (same as rarity byte, but we use it for symmetry logic)
  const symmetryByte = bytes[10] ?? 0;
  const symmetryValue = symmetryByte;
  const symmetryLabel: 'Chaotic' | 'Perfect' =
    symmetryValue < 128 ? 'Chaotic' : 'Perfect';
  const symmetryPercentage = Math.round((symmetryValue / BYTE_MAX) * 100);

  return {
    colorName: bodyColor.name,
    accentName,
    pattern,
    finShape,
    eyeType,
    rarity,
    fertility,
    symmetry: {
      value: symmetryValue,
      label: symmetryLabel,
      percentage: symmetryPercentage,
    },
  };
};

// Helper to get accent color name for display (neon palette)
const getAccentColorName = (hue: number): string => {
  if (hue < 15 || hue >= 345) return 'Molten Red';
  if (hue < 45) return 'Solar Amber';
  if (hue < 75) return 'Neon Gold';
  if (hue < 105) return 'Bio Lime';
  if (hue < 135) return 'Neon Jade';
  if (hue < 165) return 'Cryo Teal';
  if (hue < 195) return 'Neon Cyan';
  if (hue < 225) return 'Ion Blue';
  if (hue < 255) return 'Plasma Indigo';
  if (hue < 285) return 'Ultraviolet';
  if (hue < 315) return 'Cyber Magenta';
  return 'Infra Pink';
};

export const useDnaParser = (
  dna: string | null | undefined,
): DnaTraits | null => useMemo(() => parseDna(dna), [dna]);
