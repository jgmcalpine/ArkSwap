export interface BodyColorResult {
  readonly name: string;
  readonly hex: string;
  readonly hsl: string;
}

export interface EyeTraitResult {
  readonly name: string;
  readonly type: 'sensor' | 'visor' | 'pixel' | 'crosshair';
}

/**
 * Maps byte value (0-255) to traditional Koi base color
 * Used by both renderer and parser to ensure visual-text sync
 */
export const getBodyColor = (byte: number): BodyColorResult => {
  // Note: Gen 0 visual bytes are capped at 0x80 (128), so ranges are adjusted
  // to ensure variety even with the cap
  if (byte <= 25) {
    return {
      name: 'Shiro (White)',
      hex: '#F0F0F0',
      hsl: 'hsl(0 0% 92%)',
    };
  }
  if (byte <= 51) {
    return {
      name: 'Hi (Red)',
      hex: '#EE4B2B',
      hsl: 'hsl(12 85% 55%)',
    };
  }
  if (byte <= 77) {
    return {
      name: 'Sumi (Black)',
      hex: '#1A1A1A',
      hsl: 'hsl(220 15% 18%)',
    };
  }
  if (byte <= 103) {
    return {
      name: 'Ki (Yellow)',
      hex: '#FFD700',
      hsl: 'hsl(45 90% 58%)',
    };
  }
  // 104-255 (includes values up to 128 for Gen 0, and higher for later gens)
  return {
    name: 'Ai (Blue)',
    hex: '#1E3A8A',
    hsl: 'hsl(220 75% 35%)',
  };
};

/**
 * Maps byte value (0-255) to eye trait
 * Uses modulo 4 to match renderer logic exactly
 */
export const getEyeTrait = (byte: number): EyeTraitResult => {
  const index = byte % 4;
  if (index === 0) {
    return { name: 'Sensor', type: 'sensor' };
  }
  if (index === 1) {
    return { name: 'Visor', type: 'visor' };
  }
  if (index === 2) {
    return { name: 'Pixel', type: 'pixel' };
  }
  // index === 3
  return { name: 'Crosshair', type: 'crosshair' };
};

