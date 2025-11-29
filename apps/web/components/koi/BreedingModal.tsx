'use client';

import { useState } from 'react';
import type { FC, MouseEventHandler } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { KoiCard } from './KoiCard';
import { KoiRenderer } from './KoiRenderer';
import { mockArkClient } from '@arkswap/client';
import type { Vtxo, AssetMetadata } from '@arkswap/protocol';
import { getErrorMessage } from '../../lib/error-utils';
import { parseDna, type KoiRarity } from '../../hooks/useDnaParser';

type ExtendedVtxo = Vtxo & { metadata?: AssetMetadata };

export interface BreedingModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly vtxos: ExtendedVtxo[];
}

type SelectionMode = 'parent1' | 'parent2' | null;

export const BreedingModal: FC<BreedingModalProps> = ({
  isOpen,
  onClose,
  vtxos,
}) => {
  const [selectedParent1, setSelectedParent1] = useState<ExtendedVtxo | null>(null);
  const [selectedParent2, setSelectedParent2] = useState<ExtendedVtxo | null>(null);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(null);
  const [isBreeding, setIsBreeding] = useState(false);
  const [breedError, setBreedError] = useState<string | null>(null);
  const [breedSuccess, setBreedSuccess] = useState(false);

  // Filter to only asset VTXOs (those with metadata)
  const assetVtxos = vtxos.filter((v) => v.metadata && !v.spent);

  const getRarityForDna = (dna: string): KoiRarity => {
    const traits = parseDna(dna);
    return traits?.rarity ?? 'Common';
  };

  const handleSelectParent = (vtxo: ExtendedVtxo) => {
    if (selectionMode === 'parent1') {
      setSelectedParent1(vtxo);
      setSelectionMode(null);
    } else if (selectionMode === 'parent2') {
      setSelectedParent2(vtxo);
      setSelectionMode(null);
    }
  };

  const handleRemoveParent = (parent: 'parent1' | 'parent2') => {
    if (parent === 'parent1') {
      setSelectedParent1(null);
    } else {
      setSelectedParent2(null);
    }
  };

  const handleBreed: MouseEventHandler<HTMLButtonElement> = async (event) => {
    event.preventDefault();
    
    if (!selectedParent1 || !selectedParent2 || isBreeding) {
      return;
    }

    setIsBreeding(true);
    setBreedError(null);
    setBreedSuccess(false);

    try {
      const result = await mockArkClient.breed(selectedParent1.txid, selectedParent2.txid);
      
      if (result.success) {
        setBreedSuccess(true);
        // Reset selection after successful breeding
        setTimeout(() => {
          setSelectedParent1(null);
          setSelectedParent2(null);
          setBreedSuccess(false);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Breeding failed:', error);
      setBreedError(getErrorMessage(error));
    } finally {
      setIsBreeding(false);
    }
  };

  const handleClose = () => {
    if (!isBreeding) {
      setSelectedParent1(null);
      setSelectedParent2(null);
      setSelectionMode(null);
      setBreedError(null);
      setBreedSuccess(false);
      onClose();
    }
  };

  // Calculate child generation preview
  const childGeneration = selectedParent1?.metadata && selectedParent2?.metadata
    ? Math.max(selectedParent1.metadata.generation, selectedParent2.metadata.generation) + 1
    : null;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
      <div className="relative w-full max-w-5xl rounded-2xl border border-cyan-900/60 bg-gray-950/95 shadow-2xl shadow-cyan-900/40 max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={handleClose}
          disabled={isBreeding}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-gray-900/80 text-gray-400 hover:text-gray-200 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Breed Your Koi</h2>

          {/* Selection Area */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            {/* Parent 1 Slot */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Parent 1</label>
              {selectedParent1?.metadata ? (
                <div className="relative rounded-xl border border-cyan-700 bg-cyan-900/20 p-4">
                  <button
                    type="button"
                    onClick={() => handleRemoveParent('parent1')}
                    disabled={isBreeding}
                    className="absolute right-2 top-2 text-xs text-gray-400 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <div className="flex flex-col items-center">
                    <KoiRenderer
                      dna={selectedParent1.metadata.dna}
                      size={120}
                    />
                    <p className="mt-2 text-xs font-mono text-cyan-300">
                      Gen {selectedParent1.metadata.generation}
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectionMode('parent1')}
                  disabled={isBreeding}
                  className={cn(
                    'w-full rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/40 p-8',
                    'hover:border-cyan-600 hover:bg-cyan-900/20',
                    'transition-colors text-gray-400 hover:text-cyan-300',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectionMode === 'parent1' && 'border-cyan-500 bg-cyan-900/30'
                  )}
                >
                  <div className="text-center">
                    <p className="text-sm font-medium">Select Parent</p>
                  </div>
                </button>
              )}
            </div>

            {/* Parent 2 Slot */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-400">Parent 2</label>
              {selectedParent2?.metadata ? (
                <div className="relative rounded-xl border border-purple-700 bg-purple-900/20 p-4">
                  <button
                    type="button"
                    onClick={() => handleRemoveParent('parent2')}
                    disabled={isBreeding}
                    className="absolute right-2 top-2 text-xs text-gray-400 hover:text-red-400 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <div className="flex flex-col items-center">
                    <KoiRenderer
                      dna={selectedParent2.metadata.dna}
                      size={120}
                    />
                    <p className="mt-2 text-xs font-mono text-purple-300">
                      Gen {selectedParent2.metadata.generation}
                    </p>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setSelectionMode('parent2')}
                  disabled={isBreeding}
                  className={cn(
                    'w-full rounded-xl border-2 border-dashed border-gray-700 bg-gray-900/40 p-8',
                    'hover:border-purple-600 hover:bg-purple-900/20',
                    'transition-colors text-gray-400 hover:text-purple-300',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectionMode === 'parent2' && 'border-purple-500 bg-purple-900/30'
                  )}
                >
                  <div className="text-center">
                    <p className="text-sm font-medium">Select Parent</p>
                  </div>
                </button>
              )}
            </div>
          </div>

          {/* Fish Selection Grid (shown when selectionMode is set) */}
          {selectionMode && (
            <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-300">
                  Select {selectionMode === 'parent1' ? 'Parent 1' : 'Parent 2'}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectionMode(null)}
                  className="text-xs text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
              {assetVtxos.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No available fish to breed
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto">
                  {assetVtxos
                    .filter((vtxo) => {
                      // Exclude already selected parent
                      if (selectionMode === 'parent1' && selectedParent2?.txid === vtxo.txid) {
                        return false;
                      }
                      if (selectionMode === 'parent2' && selectedParent1?.txid === vtxo.txid) {
                        return false;
                      }
                      return true;
                    })
                    .map((vtxo) => {
                      if (!vtxo.metadata) return null;
                      const rarity = getRarityForDna(vtxo.metadata.dna);
                      return (
                        <button
                          key={vtxo.txid}
                          type="button"
                          onClick={() => handleSelectParent(vtxo)}
                          className={cn(
                            'rounded-lg border p-2 text-left transition-colors',
                            'hover:border-cyan-500 hover:bg-cyan-900/20',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500'
                          )}
                        >
                          <KoiCard
                            dna={vtxo.metadata.dna}
                            generation={vtxo.metadata.generation}
                            txid={vtxo.txid}
                            rarity={rarity}
                          />
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Preview Area */}
          {selectedParent1?.metadata && selectedParent2?.metadata && (
            <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Parent 1</p>
                  <p className="text-sm font-mono text-cyan-300">
                    Gen {selectedParent1.metadata.generation}
                  </p>
                </div>
                <span className="text-2xl text-gray-500">+</span>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Parent 2</p>
                  <p className="text-sm font-mono text-purple-300">
                    Gen {selectedParent2.metadata.generation}
                  </p>
                </div>
                <span className="text-2xl text-gray-500">→</span>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Child</p>
                  <p className="text-sm font-mono text-green-300">
                    Gen {childGeneration}
                  </p>
                </div>
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-400">
                  Cost: <span className="text-green-400">0 (Fusion)</span>
                </p>
              </div>
            </div>
          )}

          {/* Action Button */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleBreed}
              disabled={!selectedParent1 || !selectedParent2 || isBreeding}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium',
                'border-cyan-600 bg-cyan-700/20 text-cyan-100',
                'hover:bg-cyan-600/30 hover:text-white',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500',
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              {isBreeding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Breeding...
                </>
              ) : (
                'Breed Now'
              )}
            </button>

            {breedError && (
              <p className="text-xs text-red-400 text-center">{breedError}</p>
            )}

            {breedSuccess && (
              <p className="text-xs text-green-400 text-center">
                Breeding successful! Your new Koi will appear after the next Round.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

