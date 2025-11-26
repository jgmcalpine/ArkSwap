'use client';

import type { FC, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { getBodyColor, getEyeTrait } from '../../lib/koi-traits';

export interface KoiRendererProps {
  readonly dna: string;
  readonly size?: number;
}

const BYTE_MAX = 255;

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

const hueFromByte = (byte: number): number => (byte / BYTE_MAX) * 360;

const hslString = (hue: number, saturation: number, lightness: number): string =>
  `hsl(${hue.toFixed(0)} ${saturation}% ${lightness}%)`;

const BODY_PATH =
  'M 150 80 C 120 92 104 120 100 154 C 96 188 96 230 102 270 C 108 310 118 344 130 372 C 138 392 144 410 150 424 C 156 410 162 392 170 372 C 182 344 192 310 198 270 C 204 230 204 188 200 154 C 196 120 180 92 150 80 Z';

type BarbelsVariant = 'short' | 'long' | 'antennae';

type PatternMode = 'organic' | 'cyber' | 'hybrid';

interface SpotShape {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

interface CircuitShape {
  readonly x: number;
  readonly y: number;
  readonly length: number;
}

const getBarbelsVariant = (value: number): BarbelsVariant => {
  if (value < 85) return 'short';
  if (value < 170) return 'long';
  return 'antennae';
};

const getPatternMode = (value: number): PatternMode => {
  if (value < 85) return 'organic';
  if (value < 170) return 'cyber';
  return 'hybrid';
};

const generateSpots = (bytes: number[], isSymmetric: boolean): SpotShape[] => {
  const spots: SpotShape[] = [];
  const count = 3 + (bytes[4] ?? 0) % 4;

  for (let i = 0; i < count; i += 1) {
    const seedY = bytes[5 + i] ?? 0;
    const seedR = bytes[8 + i] ?? 0;
    const seedSide = bytes[9 + i] ?? 0;

    const y = 140 + (seedY % 220);
    const offset = 10 + (seedSide % 40);
    const side = seedSide % 2 === 0 ? -1 : 1;
    const baseX = 150 + side * offset;
    const radius = 10 + (seedR % 16);

    spots.push({ x: baseX, y, radius });

    if (isSymmetric) {
      const mirroredX = 150 - (baseX - 150);
      spots.push({ x: mirroredX, y, radius });
    }
  }

  return spots;
};

const generateCircuits = (bytes: number[], isSymmetric: boolean): CircuitShape[] => {
  const circuits: CircuitShape[] = [];
  const count = 2 + (bytes[6] ?? 0) % 3;

  for (let i = 0; i < count; i += 1) {
    const seedY = bytes[7 + i] ?? 0;
    const seedLen = bytes[10 + i] ?? 0;
    const seedSide = bytes[12 + i] ?? 0;

    const y = 150 + (seedY % 220);
    const length = 40 + (seedLen % 60);
    const offset = 6 + (seedSide % 32);
    const side = seedSide % 2 === 0 ? -1 : 1;
    const baseX = 150 + side * offset;

    circuits.push({ x: baseX, y, length });

    if (isSymmetric) {
      const mirroredX = 150 - (baseX - 150);
      circuits.push({ x: mirroredX, y, length });
    }
  }

  return circuits;
};

const renderSpots = (spots: SpotShape[], fill: string): ReactNode =>
  spots.map((spot, index) => (
    <circle
      key={`spot-${index}`}
      cx={spot.x}
      cy={spot.y}
      r={spot.radius}
      fill={fill}
      opacity={0.9}
    />
  ));

const renderCircuits = (circuits: CircuitShape[], stroke: string): ReactNode =>
  circuits.map((circuit, index) => {
    const x1 = circuit.x - circuit.length / 2;
    const x2 = circuit.x + circuit.length / 2;
    const midY = circuit.y - 8;
    return (
      <path
        key={`circuit-${index}`}
        d={`M ${x1} ${circuit.y} Q ${circuit.x} ${midY} ${x2} ${circuit.y}`}
        stroke={stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
    );
  });

type EyeType = 'sensor' | 'visor' | 'pixel' | 'crosshair';

const renderDorsalRidge = (stroke: string): ReactNode => (
  <path
    d="M 150 100 C 148 160 148 230 150 290 C 152 230 152 160 150 100 Z"
    stroke={stroke}
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    fill="none"
    opacity={0.35}
  />
);

const renderPectoralFins = (fill: string, accent: string): ReactNode => (
  <>
    {/* Left pectoral fin - attached at x=92 */}
    <g>
      <path
        d="M 92 160 C 57 176 39 204 41 238 C 57 226 73 210 91 184 Z"
        fill={fill}
        opacity={0.9}
      />
      {/* Fin rays */}
      <path
        d="M 92 160 L 49 195"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
      <path
        d="M 92 160 L 45 210"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
      <path
        d="M 92 160 L 43 225"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
    </g>
    {/* Right pectoral fin - attached at x=208 */}
    <g>
      <path
        d="M 208 160 C 243 176 261 204 259 238 C 243 226 227 210 209 184 Z"
        fill={fill}
        opacity={0.9}
      />
      {/* Fin rays */}
      <path
        d="M 208 160 L 251 195"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
      <path
        d="M 208 160 L 255 210"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
      <path
        d="M 208 160 L 257 225"
        stroke={accent}
        strokeWidth={0.8}
        strokeLinecap="round"
        opacity={0.4}
      />
    </g>
  </>
);

const renderTail = (fill: string, accent: string): ReactNode => (
  <g>
    <path
      d="M 150 424 C 132 444 124 462 124 486 C 140 476 150 474 150 474 C 150 474 160 476 176 486 C 176 462 168 444 150 424 Z"
      fill={fill}
      opacity={0.95}
    />
    {/* Tail rays */}
    <path
      d="M 150 424 L 130 450"
      stroke={accent}
      strokeWidth={0.8}
      strokeLinecap="round"
      opacity={0.4}
    />
    <path
      d="M 150 424 L 150 460"
      stroke={accent}
      strokeWidth={0.8}
      strokeLinecap="round"
      opacity={0.4}
    />
    <path
      d="M 150 424 L 170 450"
      stroke={accent}
      strokeWidth={0.8}
      strokeLinecap="round"
      opacity={0.4}
    />
    <path
      d="M 150 424 L 128 470"
      stroke={accent}
      strokeWidth={0.8}
      strokeLinecap="round"
      opacity={0.4}
    />
    <path
      d="M 150 424 L 172 470"
      stroke={accent}
      strokeWidth={0.8}
      strokeLinecap="round"
      opacity={0.4}
    />
  </g>
);

const renderBarbels = (variant: BarbelsVariant, stroke: string): ReactNode => {
  // Barbels attached at nose tip (y=60, x=150)
  if (variant === 'short') {
    return (
      <>
        <path
          d="M 145 60 C 142 70 140 78 140 86"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 155 60 C 158 70 160 78 160 86"
          stroke={stroke}
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
        />
      </>
    );
  }

  if (variant === 'long') {
    return (
      <>
        <path
          d="M 143 60 C 135 78 130 106 132 130"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 157 60 C 165 78 170 106 168 130"
          stroke={stroke}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
      </>
    );
  }

  // antennae
  return (
    <>
      <path
        d="M 143 60 C 133 78 130 102 136 124"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={136} cy={124} r={3} fill={stroke} />
      <path
        d="M 157 60 C 167 78 170 102 164 124"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={164} cy={124} r={3} fill={stroke} />
    </>
  );
};

const renderEye = (x: number, y: number, type: EyeType, accent: string): ReactNode => {
  const socketRadius = 5;
  const baseProps = { cx: x, cy: y };

  switch (type) {
    case 'sensor': {
      // Solid Circle
      return (
        <g>
          <circle {...baseProps} r={socketRadius} fill="#020617" />
          <circle {...baseProps} r={3.2} fill={accent} />
        </g>
      );
    }
    case 'visor': {
      // Horizontal Bar
      return (
        <g>
          <circle {...baseProps} r={socketRadius} fill="#020617" />
          <rect
            x={x - 4}
            y={y - 1.2}
            width={8}
            height={2.4}
            rx={1}
            fill={accent}
          />
        </g>
      );
    }
    case 'pixel': {
      // Square
      return (
        <g>
          <circle {...baseProps} r={socketRadius} fill="#020617" />
          <rect
            x={x - 2.4}
            y={y - 2.4}
            width={4.8}
            height={4.8}
            fill={accent}
          />
        </g>
      );
    }
    case 'crosshair': {
      // Circle with +
      return (
        <g>
          <circle {...baseProps} r={socketRadius} fill="#020617" />
          <circle {...baseProps} r={2.8} fill="none" stroke={accent} strokeWidth={1} />
          <line
            x1={x - 3}
            y1={y}
            x2={x + 3}
            y2={y}
            stroke={accent}
            strokeWidth={1}
            strokeLinecap="round"
          />
          <line
            x1={x}
            y1={y - 3}
            x2={x}
            y2={y + 3}
            stroke={accent}
            strokeWidth={1}
            strokeLinecap="round"
          />
        </g>
      );
    }
    default:
      // Fallback to sensor
      return (
        <g>
          <circle {...baseProps} r={socketRadius} fill="#020617" />
          <circle {...baseProps} r={3.2} fill={accent} />
        </g>
      );
  }
};

const renderEyes = (eyeType: EyeType, accent: string, eyeGlowId: string): ReactNode => (
  <g filter={`url(#${eyeGlowId})`}>
    {renderEye(128, 112, eyeType, accent)}
    {renderEye(172, 112, eyeType, accent)}
  </g>
);

export const KoiRenderer: FC<KoiRendererProps> = ({ dna, size = 220 }) => {
  const normalised = normaliseDna(dna);
  const bytes = hexToBytes(normalised);

  // Traditional Koi Base Color (from byte 1) - using shared function
  // Note: Byte 0 is version, Byte 1 is first visual byte
  const baseByte = bytes[1] ?? 0;
  const koiBase = getBodyColor(baseByte);
  const bodyFill = koiBase.hsl;

  // Neon Accent Color (for patterns, fins, eyes) - derived from byte 2
  const accentHue = hueFromByte(bytes[2] ?? 170);
  const accentColor = hslString(accentHue, 92, 68);
  const accentSoft = hslString(accentHue, 85, 58);

  const patternByte = bytes[3] ?? 0;
  const patternMode: PatternMode = getPatternMode(patternByte);

  const symmetryScore = bytes[10] ?? 0;
  const isSymmetric = symmetryScore > 128;

  const barbelsVariant = getBarbelsVariant(bytes[6] ?? 0);
  // Eye type using shared function - ensures exact match with parser
  const eyeTrait = getEyeTrait(bytes[8] ?? 0);
  const eyeType: EyeType = eyeTrait.type;

  const organicSpots = generateSpots(bytes, isSymmetric && patternMode !== 'cyber');
  const cyberCircuits = generateCircuits(bytes, isSymmetric && patternMode !== 'organic');

  const idBase = `koi-${normalised.slice(0, 8)}`;
  const bodyId = `${idBase}-body`;
  const clipId = `${idBase}-clip`;
  const textureId = `${idBase}-texture`;
  const patternGlowId = `${idBase}-pattern-glow`;
  const eyeGlowId = `${idBase}-eye-glow`;

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center koi-float',
        'transition-transform duration-300'
      )}
    >
      <svg
        viewBox="0 0 300 500"
        width={size}
        height={(size * 5) / 3}
        aria-hidden="true"
        overflow="visible"
      >
        <defs>
          <path id={bodyId} d={BODY_PATH} />

          <clipPath id={clipId}>
            <use href={`#${bodyId}`} />
          </clipPath>

          <pattern
            id={textureId}
            x="0"
            y="0"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="6" height="1" fill="#ffffff" opacity="0.12" />
          </pattern>

          <filter
            id={patternGlowId}
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="4"
              floodColor={accentColor}
              floodOpacity="0.45"
            />
          </filter>

          <filter
            id={eyeGlowId}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="3"
              floodColor={accentColor}
              floodOpacity="0.7"
            />
          </filter>
        </defs>

        {/* Body base (matte) */}
        <use href={`#${bodyId}`} fill={bodyFill} stroke="#020617" strokeWidth={2} />

        {/* Texture overlay (very subtle, clipped) */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            x={90}
            y={90}
            width={120}
            height={320}
            fill={`url(#${textureId})`}
            opacity={0.1}
          />
        </g>

        {/* Pattern engine, clipped to body */}
        <g clipPath={`url(#${clipId})`} filter={`url(#${patternGlowId})`}>
          {patternMode === 'organic' && renderSpots(organicSpots, accentSoft)}
          {patternMode === 'cyber' && renderCircuits(cyberCircuits, accentColor)}
          {patternMode === 'hybrid' && (
            <>
              {renderSpots(organicSpots.slice(0, Math.ceil(organicSpots.length / 2)), accentSoft)}
              {renderCircuits(cyberCircuits, accentColor)}
            </>
          )}
        </g>

        {/* Dorsal ridge */}
        {renderDorsalRidge(accentSoft)}

        {/* Pectoral fins with rays */}
        {renderPectoralFins(accentSoft, accentColor)}

        {/* Tail with rays */}
        {renderTail(accentSoft, accentColor)}

        {/* Barbels */}
        {renderBarbels(barbelsVariant, accentColor)}

        {/* Eyes with subtle glow */}
        {renderEyes(eyeType, accentColor, eyeGlowId)}
      </svg>
    </div>
  );
};

