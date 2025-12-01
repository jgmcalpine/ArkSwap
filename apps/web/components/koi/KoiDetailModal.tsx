'use client';

import { useState, useEffect } from 'react';
import type { FC, MouseEventHandler } from 'react';
import { X, Shield, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { KoiRenderer } from './KoiRenderer';
import type { DnaTraits, KoiRarity } from '../../hooks/useDnaParser';
import type { AssetMetadata, Vtxo } from '@arkswap/protocol';
import { getErrorMessage } from '../../lib/error-utils';
import { mockArkClient } from '@arkswap/client';
import { asTxId } from '@arkswap/protocol';

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
  readonly metadata?: AssetMetadata;
  readonly currentBlock?: number | null;
  readonly onFeed?: MouseEventHandler<HTMLButtonElement>;
  readonly isFeeding?: boolean;
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
  metadata,
  currentBlock,
  onFeed,
  isFeeding = false,
}) => {
  const [feedError, setFeedError] = useState<string | null>(null);
  const [geneticsVerified, setGeneticsVerified] = useState<boolean | null>(
    null,
  );
  const [isVerifying, setIsVerifying] = useState(false);

  // Clear error when modal opens/closes
  useEffect(() => {
    if (open) {
      setFeedError(null);
    }
  }, [open]);

  // Run verification on mount or when metadata/txid changes
  useEffect(() => {
    if (!open || !metadata || !txid) {
      setGeneticsVerified(null);
      return;
    }

    const verify = async () => {
      setIsVerifying(true);
      try {
        // Create a VTXO-like object for verification
        const childVtxo: Vtxo & { metadata?: AssetMetadata } = {
          txid: asTxId(txid),
          vout: 0,
          amount: 0,
          address: '' as any,
          spent: false,
          metadata,
        };

        const isValid = await mockArkClient.verifyGenetics(childVtxo);
        setGeneticsVerified(isValid);
      } catch (error) {
        console.error('Genetics verification failed:', error);
        setGeneticsVerified(false);
      } finally {
        setIsVerifying(false);
      }
    };

    verify();
  }, [open, metadata, txid]);

  // Wrap onFeed to catch errors
  const handleFeed: MouseEventHandler<HTMLButtonElement> = async (event) => {
    if (!onFeed) return;

    // Clear any previous error
    setFeedError(null);

    try {
      await onFeed(event);
    } catch (err) {
      setFeedError(getErrorMessage(err));
    }
  };

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

  const displayDna = dna
    .trim()
    .toLowerCase()
    .replace(/^0x/, '')
    .padEnd(64, '0')
    .slice(0, 64);

  // Calculate blocks since last fed (Growth Cycle)
  // Logic check: blocksSinceFed = currentBlock - lastFedBlock
  const blocksSince = (currentBlock || 0) - (metadata?.lastFedBlock || 0);
  const blocksSinceFedValid =
    metadata?.lastFedBlock != null && currentBlock != null ? blocksSince : null;

  // Calculate hibernation status
  const isHibernating =
    blocksSinceFedValid != null && blocksSinceFedValid > 144;
  const hibernationStatus =
    blocksSinceFedValid != null
      ? isHibernating
        ? 'Hibernating 💤'
        : 'Growing 🌿'
      : null;

  // Calculate feeding cooldown (72 blocks = 12 hours, allows 2 feeds per 144-block "Bitcoin Day")
  const cooldown = 72;
  const isDigesting =
    metadata?.lastFedBlock != null && currentBlock != null
      ? blocksSince < cooldown
      : false;
  const blocksUntilFeed = isDigesting ? Math.max(0, cooldown - blocksSince) : 0;

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
                    const segmentValue = displayDna.slice(
                      segment.start,
                      segment.start + segment.length,
                    );
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
                  {metadata && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">XP</span>
                      <span className="font-medium text-cyan-200">
                        {metadata.xp}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Symmetry</span>
                    <span className="font-medium text-gray-100">
                      {traits?.symmetry ? (
                        <span className="flex items-center gap-2">
                          <span
                            className={
                              traits.symmetry.label === 'Perfect'
                                ? 'text-cyan-300'
                                : 'text-amber-400'
                            }
                          >
                            {traits.symmetry.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {traits.symmetry.value}/255 (
                            {traits.symmetry.percentage}%)
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
                  {/* Debug info - temporary */}
                  {metadata && (
                    <div className="pb-1 border-b border-gray-800">
                      <small className="text-[10px] text-gray-500 font-mono">
                        Height: {currentBlock ?? 'N/A'} | LastFed:{' '}
                        {metadata.lastFedBlock ?? 'N/A'}
                      </small>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500">TxID</p>
                    <p className="font-mono text-[11px] text-cyan-300">
                      {truncatedTxid}
                    </p>
                  </div>
                  {blocksSinceFedValid != null && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-gray-500">Growth Cycle</span>
                      <span className="font-medium text-gray-100">
                        {blocksSinceFedValid} blocks
                      </span>
                    </div>
                  )}
                  {hibernationStatus && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-500">Status</span>
                      <span
                        className={cn(
                          'font-medium',
                          isHibernating ? 'text-red-400' : 'text-green-400',
                        )}
                      >
                        {hibernationStatus}
                        {blocksSinceFedValid != null &&
                          ` (${blocksSinceFedValid} blocks)`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-gray-500">Owner</span>
                    <span className="font-medium text-gray-100">
                      {ownerLabel}
                    </span>
                  </div>
                  {metadata &&
                    metadata.parents &&
                    metadata.parents.length > 0 && (
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-800">
                        <span className="text-gray-500">Genetics</span>
                        <span className="flex items-center gap-1.5 font-medium">
                          {isVerifying ? (
                            <span className="text-gray-400 text-xs">
                              Verifying...
                            </span>
                          ) : geneticsVerified === true ? (
                            <>
                              <Shield className="h-3.5 w-3.5 text-green-400" />
                              <span className="text-green-400 text-xs">
                                🧬 Verified Genetics
                              </span>
                            </>
                          ) : geneticsVerified === false ? (
                            <>
                              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                              <span className="text-red-400 text-xs">
                                ⚠️ Genetic Mismatch (Protocol Violation)
                              </span>
                            </>
                          ) : null}
                        </span>
                      </div>
                    )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {onFeed && (
                <>
                  <button
                    type="button"
                    onClick={handleFeed}
                    disabled={
                      isFeeding ||
                      (currentBlock || 0) - (metadata?.lastFedBlock || 0) < 72
                    }
                    className={cn(
                      'inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium',
                      'border-green-600 bg-green-700/20 text-green-100',
                      'hover:bg-green-600/30 hover:text-white',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                    )}
                  >
                    {isFeeding
                      ? 'Feeding…'
                      : isDigesting
                        ? `Digesting (${blocksUntilFeed} blocks)`
                        : 'Feed'}
                  </button>
                  {feedError && (
                    <p className="text-xs text-red-400 mt-2">{feedError}</p>
                  )}
                  {metadata && (
                    <div className="mt-4 p-2 bg-gray-900 rounded text-xs font-mono text-gray-500">
                      <p>Chain Height: {currentBlock}</p>
                      <p>Last Fed: {metadata.lastFedBlock}</p>
                      <p>
                        Hunger:{' '}
                        {(currentBlock || 0) - (metadata.lastFedBlock || 0)}
                      </p>
                      <p>Cooldown: 72</p>
                    </div>
                  )}
                </>
              )}
              {onShowOff && (
                <button
                  type="button"
                  onClick={onShowOff}
                  disabled={isEnteringPond}
                  className={cn(
                    'inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium',
                    'border-cyan-600 bg-cyan-700/20 text-cyan-100',
                    'hover:bg-cyan-600/30 hover:text-white',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                  )}
                >
                  {isEnteringPond ? 'Submitting to Pond…' : showOffLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
