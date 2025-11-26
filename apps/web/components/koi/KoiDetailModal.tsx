'use client';

import type { FC, MouseEventHandler } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { KoiRenderer } from './KoiRenderer';
import type { DnaTraits, KoiRarity } from '../../hooks/useDnaParser';

export interface KoiDetailModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly dna: string;
  readonly txid: string;
  readonly generation: number;
  readonly traits: DnaTraits | null;
  readonly rarity: KoiRarity;
  readonly coinAgeBlocks?: number | null;
  readonly ownerLabel?: string;
  readonly showOffLabel?: string;
  readonly isEnteringPond?: boolean;
  readonly onShowOff?: MouseEventHandler<HTMLButtonElement>;
}

export const KoiDetailModal: FC<KoiDetailModalProps> = ({
  open,
  onClose,
  dna,
  txid,
  generation,
  traits,
  rarity,
  coinAgeBlocks,
  ownerLabel = 'You',
  showOffLabel = 'Show Off',
  isEnteringPond = false,
  onShowOff,
}) => {
  if (!open) {
    return null;
  }

  const truncatedTxid = `${txid.slice(0, 12)}…${txid.slice(-8)}`;
  const dnaSegments = [
    { label: 'Body A', start: 0, length: 4 },
    { label: 'Body B', start: 4, length: 4 },
    { label: 'Accent', start: 8, length: 4 },
    { label: 'Pattern', start: 12, length: 2 },
    { label: 'Fins', start: 14, length: 2 },
    { label: 'Eyes', start: 16, length: 2 },
    { label: 'Rarity', start: 20, length: 2 },
    { label: 'Fertility', start: 22, length: 2 },
  ];

  const displayDna = dna.trim().toLowerCase().replace(/^0x/, '').padEnd(64, '0').slice(0, 64);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="relative w-full max-w-4xl rounded-2xl border border-cyan-900/60 bg-gray-950/95 shadow-2xl shadow-cyan-900/40">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="grid gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-center">
          <div className="flex flex-col items-center justify-center">
            <div className="mb-4 text-xs font-mono uppercase tracking-[0.16em] text-cyan-400/70">
              Gen {generation} Cyber-Koi
            </div>
            <KoiRenderer dna={dna} size={260} />
          </div>

          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                DNA Strand
              </p>
              <div className="rounded-lg border border-gray-800 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-cyan-300">
                <div className="flex flex-wrap gap-1.5">
                  {dnaSegments.map((segment) => {
                    const segmentValue = displayDna.slice(segment.start, segment.start + segment.length);
                    return (
                      <span
                        key={segment.label}
                        className="relative rounded-[4px] bg-cyan-900/20 px-1.5 py-0.5 text-cyan-200/90 ring-1 ring-cyan-700/40"
                      >
                        <span className="mr-1 text-[9px] uppercase tracking-wide text-cyan-400/70">
                          {segment.label}
                        </span>
                        <span>{segmentValue}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                  Attributes
                </p>
                <div className="space-y-1.5 rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-xs text-gray-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Body</span>
                    <span className="font-medium text-cyan-200">
                      {traits?.colorName ?? 'Unknown Spectrum'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Accent</span>
                    <span className="font-medium text-cyan-200">
                      {traits?.accentName ?? 'Unknown Accent'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Pattern</span>
                    <span className="font-medium text-gray-100">
                      {traits?.pattern ?? 'Unresolved'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Fins</span>
                    <span className="font-medium text-gray-100">
                      {traits?.finShape ?? 'Standard'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Eyes</span>
                    <span className="font-medium text-gray-100">
                      {traits?.eyeType ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Fertility</span>
                    <span className="font-medium text-gray-100">
                      {traits?.fertility ?? 'Unknown'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Rarity</span>
                    <span className="font-semibold text-cyan-300">
                      {traits?.rarity ?? rarity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Symmetry</span>
                    <span className="font-medium text-gray-100">
                      {traits?.symmetry ? (
                        <span className="flex items-center gap-2">
                          <span className={traits.symmetry.label === 'Perfect' ? 'text-cyan-300' : 'text-amber-400'}>
                            {traits.symmetry.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {traits.symmetry.value}/255 ({traits.symmetry.percentage}%)
                          </span>
                        </span>
                      ) : (
                        'Unknown'
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-mono text-gray-500 uppercase tracking-wide">
                  On-Chain Telemetry
                </p>
                <div className="space-y-1.5 rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-xs text-gray-300">
                  <div>
                    <p className="text-gray-500">TxID</p>
                    <p className="font-mono text-[11px] text-cyan-300">{truncatedTxid}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-gray-500">Coin Age</span>
                    <span className="font-medium text-gray-100">
                      {coinAgeBlocks != null ? `${coinAgeBlocks} blocks` : 'Simulated'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Owner</span>
                    <span className="font-medium text-gray-100">{ownerLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            {onShowOff && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onShowOff}
                  disabled={isEnteringPond}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium',
                    'border-cyan-600 bg-cyan-700/20 text-cyan-100',
                    'hover:bg-cyan-600/30 hover:text-white',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                    'disabled:cursor-not-allowed disabled:opacity-60'
                  )}
                >
                  {isEnteringPond ? 'Submitting to Pond…' : showOffLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};


