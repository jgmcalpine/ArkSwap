'use client';

import type { FC, MouseEventHandler } from 'react';
import { cn } from '../../lib/utils';
import { KoiRenderer } from './KoiRenderer';
import type { KoiRarity } from '../../hooks/useDnaParser';

export interface KoiCardProps {
  readonly dna: string;
  readonly generation: number;
  readonly txid: string;
  readonly rarity: KoiRarity;
  readonly onClick?: MouseEventHandler<HTMLButtonElement>;
}

const rarityClasses: Record<KoiRarity, string> = {
  Common: 'border-gray-700 text-gray-300 bg-gray-900/60',
  Rare: 'border-cyan-500 text-cyan-200 bg-cyan-900/30',
  Epic: 'border-purple-500 text-purple-200 bg-purple-900/30',
  Legendary: 'border-yellow-400 text-yellow-200 bg-yellow-900/30',
};

const rarityLabelClasses: Record<KoiRarity, string> = {
  Common: 'bg-gray-800/70 text-gray-300 border-gray-600',
  Rare: 'bg-cyan-900/60 text-cyan-200 border-cyan-500',
  Epic: 'bg-purple-900/60 text-purple-200 border-purple-500',
  Legendary: 'bg-yellow-900/60 text-yellow-200 border-yellow-500',
};

export const KoiCard: FC<KoiCardProps> = ({
  dna,
  generation,
  txid,
  rarity,
  onClick,
}) => {
  const truncatedTxid = `${txid.slice(0, 10)}…${txid.slice(-6)}`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col rounded-xl border p-3 text-left',
        'bg-gradient-to-b from-gray-950/90 to-gray-900/80',
        'hover:from-gray-900/90 hover:to-gray-950/90',
        'transition-transform transition-colors duration-200',
        'hover:-translate-y-1 focus-visible:-translate-y-1',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
        rarityClasses[rarity],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-mono text-gray-500">Gen {generation}</p>
          <p className="mt-1 text-[11px] font-mono text-gray-500 truncate">
            {truncatedTxid}
          </p>
        </div>
        <div
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            rarityLabelClasses[rarity],
          )}
        >
          {rarity}
        </div>
      </div>

      <div className="mt-3 flex justify-center">
        <KoiRenderer dna={dna} size={140} />
      </div>

      <div className="pointer-events-none absolute inset-0 rounded-xl border border-cyan-500/0 ring-0 ring-cyan-500/0 group-hover:border-cyan-500/50 group-hover:ring-1 group-hover:ring-cyan-500/30 group-focus-visible:border-cyan-500 group-focus-visible:ring-2 group-focus-visible:ring-cyan-400/60" />
    </button>
  );
};
