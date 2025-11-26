'use client';

import { useState, useEffect, useRef, type MouseEventHandler } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Fish, Eye, TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { mockArkClient } from '../lib/ark-client';
import type { Vtxo, AssetMetadata } from '@arkswap/protocol';
import { getErrorMessage } from '../lib/error-utils';
import { parseDna, type DnaTraits, type KoiRarity } from '../hooks/useDnaParser';
import { getBitcoinInfo } from '../lib/api';
import { KoiCard } from './koi/KoiCard';
import { KoiDetailModal } from './koi/KoiDetailModal';

// Extended VTXO type that may include asset metadata
type ExtendedVtxo = Vtxo & { metadata?: AssetMetadata };

interface KoiPondProps {
  walletAddress: string | null;
  vtxos: ExtendedVtxo[];
  onMint?: () => void;
  onEnterPond?: (vtxo: ExtendedVtxo) => void;
}

type SelectedKoi =
  | { source: 'wallet'; vtxo: ExtendedVtxo }
  | { source: 'pond'; txid: string; metadata: AssetMetadata };

export function KoiPond({ walletAddress, vtxos, onMint, onEnterPond }: KoiPondProps) {
  const [isMinting, setIsMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintStatus, setMintStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; distribution: Record<string, number> } | null>(null);
  const [pond, setPond] = useState<Array<{ txid: string; metadata: AssetMetadata }>>([]);
  const [isEnteringPond, setIsEnteringPond] = useState<string | null>(null);
  const [pondError, setPondError] = useState<string | null>(null);
  const [showPond, setShowPond] = useState(false);
  const previousAssetCountRef = useRef<number>(0);
  const [selectedKoi, setSelectedKoi] = useState<SelectedKoi | null>(null);
  const [isFeeding, setIsFeeding] = useState<string | null>(null);

  // Poll Bitcoin blockchain height every 5 seconds
  const { data: bitcoinInfo } = useQuery({
    queryKey: ['bitcoin-info'],
    queryFn: getBitcoinInfo,
    refetchInterval: 5000,
  });

  const currentBlock = bitcoinInfo?.blocks ?? null;

  // Clear mint status when a new asset appears
  useEffect(() => {
    const currentAssetCount = vtxos.filter(v => v.metadata).length;
    if (currentAssetCount > previousAssetCountRef.current && mintStatus) {
      setMintStatus(null);
    }
    previousAssetCountRef.current = currentAssetCount;
  }, [vtxos, mintStatus]);

  // Fetch stats on mount and periodically
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsData = await mockArkClient.getStats();
        setStats(statsData);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch pond data when showPond is true
  useEffect(() => {
    if (!showPond) return;

    const fetchPond = async () => {
      try {
        const pondData = await mockArkClient.getPond();
        setPond(pondData);
      } catch (error) {
        console.error('Failed to fetch pond:', error);
      }
    };

    fetchPond();
    const interval = setInterval(fetchPond, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [showPond]);


  const handleMint = async () => {
    if (!walletAddress) return;
    
    setIsMinting(true);
    setMintError(null);
    setMintStatus(null);
    try {
      await mockArkClient.mintGen0(1000);
      setMintStatus('Fish sent to pool. Waiting for Round...');
      onMint?.();
    } catch (error) {
      console.error("Mint failed", error);
      setMintError(getErrorMessage(error));
    } finally {
      setIsMinting(false);
    }
  };

  const handleEnterPond = async (vtxo: ExtendedVtxo) => {
    if (!vtxo.metadata) return;

    setIsEnteringPond(vtxo.txid);
    setPondError(null);

    try {
      await mockArkClient.enterPond(vtxo);
      // Refresh pond if it's visible
      if (showPond) {
        const pondData = await mockArkClient.getPond();
        setPond(pondData);
      }
      // Refresh stats
      const statsData = await mockArkClient.getStats();
      setStats(statsData);
      onEnterPond?.(vtxo);
    } catch (error) {
      console.error('Failed to enter pond:', error);
      setPondError(getErrorMessage(error));
    } finally {
      setIsEnteringPond(null);
    }
  };

  const koiAssets: ExtendedVtxo[] = vtxos.filter((v) => v.metadata) as ExtendedVtxo[];

  const getRarityForDna = (dna: string): KoiRarity => {
    const traits = parseDna(dna);
    return traits?.rarity ?? 'Common';
  };

  const handleOpenWalletKoi = (vtxo: ExtendedVtxo) => {
    if (!vtxo.metadata) return;
    setSelectedKoi({ source: 'wallet', vtxo });
  };

  const handleOpenPondKoi = (item: { txid: string; metadata: AssetMetadata }) => {
    setSelectedKoi({ source: 'pond', txid: item.txid, metadata: item.metadata });
  };

  const handleCloseModal = () => {
    setSelectedKoi(null);
  };

  const handleShowOffSelected: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    if (!selectedKoi || selectedKoi.source !== 'wallet') {
      return;
    }
    void handleEnterPond(selectedKoi.vtxo);
  };

  const handleFeedSelected: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.preventDefault();
    if (!selectedKoi || selectedKoi.source !== 'wallet' || !selectedKoi.vtxo.metadata) {
      return;
    }

    setIsFeeding(selectedKoi.vtxo.txid);
    try {
      const result = await mockArkClient.feedKoi(selectedKoi.vtxo);
      // Update the selected koi's metadata
      if (selectedKoi.source === 'wallet') {
        setSelectedKoi({
          ...selectedKoi,
          vtxo: {
            ...selectedKoi.vtxo,
            metadata: result.metadata,
          },
        });
      }
      // Refresh stats
      const statsData = await mockArkClient.getStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to feed Koi:', error);
      // Re-throw error so modal can display it
      throw error;
    } finally {
      setIsFeeding(null);
    }
  };

  const selectedMetadata: AssetMetadata | undefined =
    selectedKoi?.source === 'wallet'
      ? selectedKoi.vtxo.metadata
      : selectedKoi?.source === 'pond'
        ? selectedKoi.metadata
        : undefined;

  const selectedDna = selectedMetadata?.dna ?? '';
  const selectedTraits: DnaTraits | null = selectedDna ? parseDna(selectedDna) : null;
  const selectedRarity: KoiRarity = selectedTraits?.rarity ?? 'Common';
  const selectedTxId =
    selectedKoi?.source === 'wallet'
      ? selectedKoi.vtxo.txid
      : selectedKoi?.source === 'pond'
        ? selectedKoi.txid
        : '';
  const selectedGeneration = selectedMetadata?.generation ?? 0;
  const selectedOwnerLabel = selectedKoi?.source === 'wallet' ? 'You' : 'Pond';

  return (
    <div className="space-y-6">
      {/* Market Status (Census) Widget */}
      {stats && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-gray-400">Global Census</h2>
              <p className="mt-2 text-3xl font-bold text-white">
                Population: <span className="text-cyan-400">{stats.total.toLocaleString()}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span className="text-gray-400">
                  Common: <span className="text-gray-300">{stats.distribution.common}</span>
                </span>
                <span className="text-gray-400">
                  Rare: <span className="text-cyan-300">{stats.distribution.rare}</span>
                </span>
                <span className="text-gray-400">
                  Epic: <span className="text-purple-300">{stats.distribution.epic}</span>
                </span>
                <span className="text-gray-400">
                  Legendary: <span className="text-yellow-300">{stats.distribution.legendary}</span>
                </span>
              </div>
            </div>
            <div className="rounded-full bg-cyan-500/10 p-4 flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-cyan-400" />
            </div>
          </div>
        </div>
      )}

      {/* SatoshiKoi Pond Card (Minting) */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-400">SatoshiKoi Pond</h3>
            <p className="mt-1 text-sm text-gray-500">
              Mint a Gen 0 Koi that will appear in your wallet after the next Round (5 seconds)
            </p>
            {mintStatus && (
              <p className="mt-2 text-sm text-cyan-400 break-words">{mintStatus}</p>
            )}
            {mintError && (
              <p className="mt-2 text-sm text-red-400 break-words">{mintError}</p>
            )}
          </div>
          <button
            onClick={handleMint}
            disabled={isMinting || !walletAddress}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-cyan-700 bg-cyan-900/20 px-4 py-2',
              'text-sm font-medium text-cyan-400 transition-colors',
              'hover:bg-cyan-900/30 hover:text-cyan-300',
              'focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'w-full sm:w-auto flex-shrink-0'
            )}
          >
            <Fish className="h-4 w-4" />
            {isMinting ? 'Minting...' : 'Mint Gen 0 Fish (1000 sats)'}
          </button>
        </div>
      </div>

      {/* Your Koi Collection */}
      {koiAssets.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Fish className="h-5 w-5 text-cyan-400" />
              <h3 className="text-sm font-medium text-gray-400">Your Cyber-Organic Koi</h3>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {koiAssets.map((vtxo) => {
              if (!vtxo.metadata) return null;
              const { dna, generation } = vtxo.metadata;
              const rarity = getRarityForDna(dna);
              return (
                <KoiCard
                  key={vtxo.txid}
                  dna={dna}
                  generation={generation}
                  txid={vtxo.txid}
                  rarity={rarity}
                  onClick={() => handleOpenWalletKoi(vtxo)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* The Grand Pond View */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Fish className="h-5 w-5 text-cyan-400" />
            <h3 className="text-sm font-medium text-gray-400">The Grand Pond</h3>
          </div>
          <button
            onClick={() => setShowPond(!showPond)}
            className={cn(
              'flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5',
              'text-xs font-medium text-gray-400 transition-colors',
              'hover:bg-gray-700 hover:text-gray-300',
              'focus:outline-none focus:ring-2 focus:ring-cyan-500'
            )}
          >
            {showPond ? 'Hide' : 'View Pond'}
          </button>
        </div>
        
        {pondError && (
          <p className="text-sm text-red-400 mb-4">{pondError}</p>
        )}

        {showPond && (
          <div className="space-y-3">
            {pond.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                The pond is empty. Be the first to showcase your fish!
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pond.map((item) => {
                  const rarity = getRarityForDna(item.metadata.dna);
                  return (
                    <KoiCard
                      key={item.txid}
                      dna={item.metadata.dna}
                      generation={item.metadata.generation}
                      txid={item.txid}
                      rarity={rarity}
                      onClick={() => handleOpenPondKoi(item)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <KoiDetailModal
        open={!!selectedKoi && !!selectedMetadata && !!selectedDna}
        onClose={handleCloseModal}
        dna={selectedDna}
        txid={selectedTxId}
        generation={selectedGeneration}
        traits={selectedTraits}
        rarity={selectedRarity}
        coinAgeBlocks={null}
        ownerLabel={selectedOwnerLabel}
        isEnteringPond={
          selectedKoi?.source === 'wallet' ? isEnteringPond === selectedKoi.vtxo.txid : false
        }
        onShowOff={selectedKoi?.source === 'wallet' ? handleShowOffSelected : undefined}
        metadata={selectedMetadata}
        currentBlock={currentBlock}
        onFeed={selectedKoi?.source === 'wallet' ? handleFeedSelected : undefined}
        isFeeding={
          selectedKoi?.source === 'wallet' ? isFeeding === selectedKoi.vtxo.txid : false
        }
      />
    </div>
  );
}

