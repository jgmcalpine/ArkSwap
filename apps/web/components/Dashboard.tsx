'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '../context/WalletContext';
import { Coins, Droplets, ArrowRightLeft, Loader2, CheckCircle2, Fish, Eye } from 'lucide-react';
import { KoiPond } from './KoiPond';
import { cn } from '../lib/utils';
import { requestSwapQuote, commitSwap, getBitcoinInfo, type SwapQuoteResponse } from '../lib/api';
import { mockArkClient } from '@arkswap/client';
import { createSwapLock, type SwapLockResult, type Vtxo, SwapQuoteSchema, type TxId, type AssetMetadata } from '@arkswap/protocol';
import { getErrorMessage } from '../lib/error-utils';
import { saveSession, loadSession, clearSession, type SwapStep as SwapStepType } from '../lib/swap-session';

type SwapStep = 'quote' | 'locking' | 'success' | 'pendingRefund' | 'refundSuccess';

// Extended VTXO type that may include asset metadata
type ExtendedVtxo = Vtxo & { metadata?: AssetMetadata; assetId?: string };

export function Dashboard() {
  const { balance, paymentBalance, isConnected, address, refreshBalance, vtxos } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [faucetError, setFaucetError] = useState<string | null>(null);
  const [swapAmount, setSwapAmount] = useState<string>('');
  const [isRequestingQuote, setIsRequestingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [lockAddress, setLockAddress] = useState<string | null>(null);
  const [swapStep, setSwapStep] = useState<SwapStep>('quote');
  const [quote, setQuote] = useState<SwapQuoteResponse | null>(null);
  const [userL1Address, setUserL1Address] = useState<string>('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [l1TxId, setL1TxId] = useState<string | null>(null);
  const [chaosMode, setChaosMode] = useState(false);
  const [lockResult, setLockResult] = useState<SwapLockResult | null>(null);
  const [startBlock, setStartBlock] = useState<number | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number | null>(null);
  const [timeoutBlock, setTimeoutBlock] = useState<number | null>(null);
  const [isClaimingRefund, setIsClaimingRefund] = useState(false);
  const [selectedVtxos, setSelectedVtxos] = useState<TxId[]>([]);
  const [isManualSelection, setIsManualSelection] = useState(false);
  const [liftStatus, setLiftStatus] = useState<string | null>(null);
  const previousBalanceRef = useRef<number>(balance);
  const l1AddressInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const hasLoadedSessionRef = useRef<boolean>(false);
  const [isEnteringPond, setIsEnteringPond] = useState<string | null>(null);

  // React Query for bitcoin info (used in pendingRefund step)
  const { data: bitcoinInfo } = useQuery({
    queryKey: ['bitcoin-info'],
    queryFn: getBitcoinInfo,
    refetchInterval: swapStep === 'pendingRefund' ? 5000 : false,
    enabled: swapStep === 'pendingRefund',
  });

  // Load session on mount (only once)
  useEffect(() => {
    if (hasLoadedSessionRef.current) {
      return;
    }
    
    const session = loadSession();
    if (session) {
      hasLoadedSessionRef.current = true;
      setSwapStep(session.step);
      setSwapAmount(session.amount);
      setQuote(session.quote);
      setLockAddress(session.lockAddress);
      setUserL1Address(session.userL1Address);
      setL1TxId(session.l1TxId);
      setStartBlock(session.startBlock);
      setTimeoutBlock(session.timeoutBlock);
      
      // Regenerate lockResult if we have quote and lockAddress (need address for pubkey)
      if (session.quote && session.lockAddress && address) {
        const savedQuote = session.quote;
        (async () => {
          try {
            const userPubkey = await mockArkClient.getPublicKey();
            const makerPubkey = Buffer.from(savedQuote.makerPubkey, 'hex');
            const preimageHash = Buffer.from(savedQuote.preimageHash, 'hex');
            
            const lockResultData = createSwapLock({
              makerPubkey,
              userPubkey,
              preimageHash,
              timeoutBlocks: 20,
            });
            
            setLockResult(lockResultData);
          } catch (error) {
            console.error('Failed to regenerate lock result:', error);
          }
        })();
      }
    } else {
      hasLoadedSessionRef.current = true;
    }
  }, [address]);

  // Save session when relevant state changes
  useEffect(() => {
    // Don't save during 'locking' step (we revert it on load anyway)
    if (swapStep === 'locking') {
      return;
    }
    
    const session = {
      step: swapStep,
      amount: swapAmount,
      quote,
      lockAddress,
      userL1Address,
      l1TxId,
      startBlock,
      timeoutBlock,
    };
    
    saveSession(session);
  }, [swapStep, swapAmount, quote, lockAddress, userL1Address, l1TxId, startBlock, timeoutBlock]);

  // Clear lift status when balance updates (indicating round finalized)
  useEffect(() => {
    if (previousBalanceRef.current < balance && liftStatus) {
      setLiftStatus(null);
    }
    previousBalanceRef.current = balance;
  }, [balance, liftStatus]);


  const handleFaucet = async () => {
    if (!address) return;
    
    setIsLoading(true);
    setFaucetError(null);
    setLiftStatus(null);
    try {
      // Call the ASP lift endpoint
      await mockArkClient.lift(address, 10000);
      
      // Show status message
      setLiftStatus('Deposit initiated. Waiting for next Round...');
      
      // Note: Balance will update automatically when the Round finalizes
      // and the poller fetches the new coin (every 5 seconds)
      
    } catch (error) {
      console.error("Lift failed", error);
      setFaucetError(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestQuote = async () => {
    if (!address) return;
    
    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setQuoteError('Please enter a valid amount');
      return;
    }

    setIsRequestingQuote(true);
    setQuoteError(null);
    setLockAddress(null);
    setSwapStep('quote');
    setQuote(null);
    setL1TxId(null);
    setCommitError(null);

    try {
      // 1. Request quote from backend
      const quoteDataRaw = await requestSwapQuote(amount);
      const quoteData = SwapQuoteSchema.parse(quoteDataRaw);

      // 2. Get user public key from wallet
      const userPubkey = await mockArkClient.getPublicKey();

      // 3. Convert hex strings to Buffers
      const makerPubkey = Buffer.from(quoteData.makerPubkey, 'hex');
      const preimageHash = Buffer.from(quoteData.preimageHash, 'hex');

      // 4. Generate lock address using protocol
      const lockResultData = createSwapLock({
        makerPubkey,
        userPubkey,
        preimageHash,
        timeoutBlocks: 20, // Short timeout for demo (easy to mine in Regtest)
      });

      setLockAddress(lockResultData.address);
      setLockResult(lockResultData);
      setQuote(quoteData);
      
      // Scroll to L1 address input after a short delay to allow DOM update
      setTimeout(() => {
        l1AddressInputRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    } catch (err) {
      console.error("Quote request failed", err);
      setQuoteError(getErrorMessage(err));
    } finally {
      setIsRequestingQuote(false);
    }
  };

  const handleConfirmSwap = async () => {
    if (!address || !quote || !lockAddress || !userL1Address) return;

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setCommitError('Please enter a valid amount');
      return;
    }

    if (!userL1Address.trim()) {
      setCommitError('Please enter your L1 address');
      return;
    }

    setIsCommitting(true);
    setCommitError(null);
    setSwapStep('locking');
    setLoadingText('Broadcasting transaction...');

    try {
      // 1. Send L2 transaction (lock funds to HTLC address)
      // The send method handles coin selection, signing, broadcasting, and marking inputs as spent
      const l2TxId = await mockArkClient.send(amount, lockAddress);

      // 2. Wait for Round Finalization - poll until balance stabilizes
      setLoadingText('Waiting for Round Finalization...');
      
      // Capture initial balance before the transaction
      const initialBalance = balance;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Poll until balance > 0 (change VTXO has arrived) or timeout
      // Use refreshBalance() which now triggers React Query invalidation
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        await refreshBalance(); // This invalidates React Query and triggers a fetch
        
        // Check if balance has recovered (user gets change back)
        // Read directly from client after refreshBalance updates localStorage
        // We check if balance > 0 OR if balance has changed from initial (indicating round finalized)
        const currentBalance = address ? mockArkClient.getBalance(address) : 0;
        if (currentBalance > 0 || currentBalance !== initialBalance) {
          break; // Balance has stabilized
        }
        
        attempts++;
      }

      // 3. Check Chaos Mode
      if (chaosMode) {
        // Simulate backend crash - don't call commitSwap
        // Get current block to calculate timeout (targetBlock = Current + Timeout)
        try {
          const bitcoinInfoData = await getBitcoinInfo();
          const current = bitcoinInfoData.blocks;
          const timeoutBlocks = 20; // From createSwapLock
          const targetBlock = current + timeoutBlocks;
          
          // Set all state needed for refund UI
          setStartBlock(current);
          setCurrentBlock(current);
          setTimeoutBlock(targetBlock);
          
          // Transition to refund view
          setLoadingText(null);
          setSwapStep('pendingRefund');
        } catch (err) {
          console.error("Failed to get bitcoin info", err);
          // Fallback: use a default start block
          const current = 0;
          const timeoutBlocks = 20;
          const targetBlock = current + timeoutBlocks;
          setStartBlock(current);
          setCurrentBlock(current);
          setTimeoutBlock(targetBlock);
          setLoadingText(null);
          setSwapStep('pendingRefund');
        }
      } else {
        // Normal flow: Commit swap to backend
        const commitResponse = await commitSwap(quote.id, l2TxId, userL1Address.trim());

        // 4. Show success
        setL1TxId(commitResponse.l1TxId);
        setLoadingText(null);
        setSwapStep('success');
      }
    } catch (err) {
      console.error("Swap commit failed", err);
      setCommitError(getErrorMessage(err));
      setLoadingText(null);
      setSwapStep('quote');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleResetSwap = () => {
    clearSession();
    setSwapStep('quote');
    setSwapAmount('');
    setLockAddress(null);
    setQuote(null);
    setUserL1Address('');
    setL1TxId(null);
    setCommitError(null);
    setQuoteError(null);
    setLockResult(null);
    setStartBlock(null);
    setCurrentBlock(null);
    setTimeoutBlock(null);
    setSelectedVtxos([]);
    setIsManualSelection(false);
    setLoadingText(null);
  };

  // Auto-select coins when amount changes (if not manual selection)
  useEffect(() => {
    if (!address || isManualSelection || !swapAmount) {
      return;
    }

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      setSelectedVtxos([]);
      return;
    }

    try {
      const selected = mockArkClient.selectCoins(address, amount);
      setSelectedVtxos(selected.map(v => v.txid));
    } catch (error) {
      console.error('Auto coin selection failed', error);
      setSelectedVtxos([]);
    }
  }, [swapAmount, address, isManualSelection]);

  // Calculate selected total
  const selectedTotal = vtxos
    .filter((v: ExtendedVtxo) => selectedVtxos.includes(v.txid))
    .reduce((sum, v) => sum + v.amount, 0);

  const requiredAmount = parseFloat(swapAmount) || 0;
  const hasInsufficientFunds = requiredAmount > 0 && selectedTotal < requiredAmount;

  // Toggle VTXO selection
  const toggleVtxo = (txid: TxId) => {
    setIsManualSelection(true);
    setSelectedVtxos(prev => 
      prev.includes(txid)
        ? prev.filter(id => id !== txid)
        : [...prev, txid]
    );
  };

  const handleClaimRefund = async () => {
    if (!address || !lockResult) return;

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    setIsClaimingRefund(true);
    setCommitError(null);
    setLoadingText('Processing refund...');
    
    try {
      // Claim refund using lift mechanism (ensures ASP knows about the VTXO)
      await mockArkClient.claimRefund(amount, address);
      
      // Wait for Round Finalization - poll until balance updates
      setLoadingText('Waiting for Round Finalization...');
      
      // Capture initial balance before the refund
      const initialBalance = balance;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Poll until balance increases (refund VTXO has arrived) or timeout
      // Use refreshBalance() which now triggers React Query invalidation
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        await refreshBalance(); // This invalidates React Query and triggers a fetch
        
        // Check if balance has increased (refund funds have arrived)
        const currentBalance = address ? mockArkClient.getBalance(address) : 0;
        if (currentBalance > initialBalance) {
          break; // Refund funds have arrived
        }
        
        attempts++;
      }
      
      // Show success state
      setLoadingText(null);
      setSwapStep('refundSuccess');
    } catch (err) {
      console.error("Refund claim failed", err);
      setCommitError(getErrorMessage(err));
      setLoadingText(null);
    } finally {
      setIsClaimingRefund(false);
    }
  };

  // Update current block from React Query data when in pending refund state
  useEffect(() => {
    if (swapStep === 'pendingRefund' && bitcoinInfo) {
      setCurrentBlock(bitcoinInfo.blocks);
    }
  }, [swapStep, bitcoinInfo]);

  const handleEnterPond = async (vtxo: ExtendedVtxo) => {
    if (!vtxo.metadata) return;

    setIsEnteringPond(vtxo.txid);

    try {
      await mockArkClient.enterPond(vtxo);
    } catch (error) {
      console.error('Failed to enter pond:', error);
    } finally {
      setIsEnteringPond(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 text-center">
          <Coins className="mx-auto h-12 w-12 text-gray-600" />
          <h2 className="mt-4 text-xl font-semibold text-gray-300">
            Connect your wallet to get started
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            Click &quot;Connect Wallet&quot; in the navbar to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8 w-full overflow-x-hidden">
      <div className="space-y-6">
        {/* Balance Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-medium text-gray-400">Your Ark Balance</h2>
              <p className="mt-2 text-3xl font-bold text-white">
                {balance.toLocaleString()} <span className="text-xl text-gray-400">ARK</span>
              </p>
              {address && (
                <p className="mt-2 text-xs font-mono text-gray-500 break-all">{address}</p>
              )}
            </div>
            <div className="rounded-full bg-blue-500/10 p-4 flex-shrink-0">
              <Coins className="h-8 w-8 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Deposit Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-gray-400">Simulate Employer Deposit</h3>
              <p className="mt-1 text-sm text-gray-500">
                Initiate a deposit that will be processed in the next Round (5 seconds)
              </p>
              {liftStatus && (
                <p className="mt-2 text-sm text-blue-400 break-words">{liftStatus}</p>
              )}
              {faucetError && (
                <p className="mt-2 text-sm text-red-400 break-words">{faucetError}</p>
              )}
            </div>
            <button
              onClick={handleFaucet}
              disabled={isLoading}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                'text-sm font-medium text-gray-400 transition-colors',
                'hover:bg-gray-700 hover:text-gray-300',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'w-full sm:w-auto flex-shrink-0'
              )}
            >
              <Droplets className="h-4 w-4" />
              {isLoading ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </div>

        {/* Swap Quote Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-gray-400" />
              <h3 className="text-sm font-medium text-gray-400">Request Swap Quote</h3>
            </div>
            <p className="text-sm text-gray-400">
              Spendable Balance:{' '}
              <span className="font-semibold text-white">
                {paymentBalance.toLocaleString()} sats
              </span>
            </p>
            <p className="text-sm text-gray-500">
              Enter an amount to request a swap quote and generate the lock address
            </p>
            
            {swapStep === 'quote' && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chaos-mode"
                    checked={chaosMode}
                    onChange={(e) => setChaosMode(e.target.checked)}
                    className="rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="chaos-mode" className="text-sm text-gray-400 cursor-pointer">
                    Simulate Backend Crash
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="number"
                    value={swapAmount}
                    onChange={(e) => {
                      setSwapAmount(e.target.value);
                      // Reset manual selection when amount changes
                      if (isManualSelection) {
                        setIsManualSelection(false);
                      }
                    }}
                    placeholder="Amount to swap"
                    min="0"
                    step="0.01"
                    className={cn(
                      'flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                      'text-sm text-gray-300 placeholder-gray-500',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                      'w-full min-w-0'
                    )}
                  />
                  <button
                    onClick={handleRequestQuote}
                    disabled={isRequestingQuote || !swapAmount || hasInsufficientFunds}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                      'text-sm font-medium text-gray-400 transition-colors',
                      'hover:bg-gray-700 hover:text-gray-300',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      'w-full sm:w-auto flex-shrink-0'
                    )}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    {isRequestingQuote ? 'Requesting...' : 'Request Quote'}
                  </button>
                </div>
                {hasInsufficientFunds && (
                  <p className="text-sm text-yellow-400">
                    Insufficient funds selected: {selectedTotal.toLocaleString()} / {requiredAmount.toLocaleString()} sats
                  </p>
                )}
                {quoteError && (
                  <p className="text-sm text-red-400">{quoteError}</p>
                )}
                
                {/* Coin Control UI */}
                {vtxos.length > 0 && (() => {
                  // Separate VTXOs into assets and standard
                  const assetVtxos = vtxos.filter(v => v.metadata);
                  const standardVtxos = vtxos.filter(v => !v.metadata);
                  
                  const renderVtxo = (vtxo: typeof vtxos[0]) => {
                    const isSelected = selectedVtxos.includes(vtxo.txid);
                    const isAsset = !!vtxo.metadata;
                    const isEntering = isEnteringPond === vtxo.txid;
                    
                    return (
                      <div
                        key={vtxo.txid}
                        className={cn(
                          'w-full flex items-center justify-between rounded-lg border p-3',
                          'transition-colors',
                          isSelected
                            ? isAsset
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-green-500 bg-green-500/10'
                            : isAsset
                              ? 'border-cyan-700 bg-cyan-900/20'
                              : 'border-gray-700 bg-gray-800/50'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleVtxo(vtxo.txid)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                        >
                          {isAsset ? (
                            <Fish className="h-5 w-5 text-cyan-400 flex-shrink-0" />
                          ) : (
                            <Coins className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-300">
                                {vtxo.amount.toLocaleString()} sats
                              </span>
                              {isAsset && vtxo.metadata && (
                                <span className="text-xs text-cyan-400 font-medium">
                                  Gen {vtxo.metadata.generation} Koi
                                </span>
                              )}
                              {!isAsset && (
                                <span className="text-xs text-gray-500 font-medium">
                                  Standard VTXO
                                </span>
                              )}
                              {isSelected && (
                                <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 ml-auto" />
                              )}
                            </div>
                            <p className="text-xs font-mono text-gray-500 truncate mt-1">
                              {vtxo.txid.slice(0, 16)}...{vtxo.txid.slice(-8)}
                            </p>
                          </div>
                        </button>
                        {isAsset && vtxo.metadata && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEnterPond(vtxo);
                            }}
                            disabled={isEntering}
                            className={cn(
                              'ml-2 flex items-center gap-1 rounded-lg border border-cyan-700 bg-cyan-900/20 px-2 py-1',
                              'text-xs font-medium text-cyan-400 transition-colors',
                              'hover:bg-cyan-900/30 hover:text-cyan-300',
                              'focus:outline-none focus:ring-2 focus:ring-cyan-500',
                              'disabled:cursor-not-allowed disabled:opacity-50',
                              'flex-shrink-0'
                            )}
                            title="Show Off"
                          >
                            {isEntering ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                            <span className="hidden sm:inline">Show Off</span>
                          </button>
                        )}
                      </div>
                    );
                  };
                  
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-400">Available Coins</h4>
                        {isManualSelection && (
                          <button
                            onClick={() => {
                              setIsManualSelection(false);
                              const amount = parseFloat(swapAmount);
                              if (!isNaN(amount) && amount > 0 && address) {
                                try {
                                  const selected = mockArkClient.selectCoins(address, amount);
                                  setSelectedVtxos(selected.map(v => v.txid));
                                } catch (error) {
                                  console.error('Auto coin selection reset failed', error);
                                  setSelectedVtxos([]);
                                }
                              }
                            }}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            Reset to Auto-Select
                          </button>
                        )}
                      </div>
                      
                      {/* Asset VTXOs Section */}
                      {assetVtxos.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b border-cyan-800/50">
                            <Fish className="h-4 w-4 text-cyan-400" />
                            <h5 className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">
                              Assets ({assetVtxos.length})
                            </h5>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {assetVtxos.map(renderVtxo)}
                          </div>
                        </div>
                      )}
                      
                      {/* Standard VTXOs Section */}
                      {standardVtxos.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 pb-2 border-b border-gray-700/50">
                            <Coins className="h-4 w-4 text-gray-400" />
                            <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                              Standard VTXOs ({standardVtxos.length})
                            </h5>
                          </div>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {standardVtxos.map(renderVtxo)}
                          </div>
                        </div>
                      )}
                      
                      {selectedVtxos.length > 0 && (
                        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                          <p className="text-xs text-gray-400">
                            Selected: <span className="font-medium text-gray-300">{selectedTotal.toLocaleString()}</span> sats
                            {requiredAmount > 0 && (
                              <span className={cn(
                                'ml-2',
                                hasInsufficientFunds ? 'text-yellow-400' : 'text-green-400'
                              )}>
                                ({selectedTotal >= requiredAmount ? '✓' : '✗'} {requiredAmount.toLocaleString()} required)
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {lockAddress && quote && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 overflow-hidden">
                      <p className="text-xs font-medium text-gray-400 mb-2">Lock Address:</p>
                      <p className="text-sm font-mono text-green-400 break-all overflow-wrap-anywhere">{lockAddress}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400">
                        Your L1 Address (where you want to receive BTC)
                      </label>
                      <input
                        ref={l1AddressInputRef}
                        type="text"
                        value={userL1Address}
                        onChange={(e) => setUserL1Address(e.target.value)}
                        placeholder="Enter your Bitcoin address"
                        className={cn(
                          'w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                          'text-sm text-gray-300 placeholder-gray-500',
                          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                        )}
                      />
                    </div>
                    <button
                      onClick={handleConfirmSwap}
                      disabled={isCommitting || !userL1Address.trim() || hasInsufficientFunds}
                      className={cn(
                        'w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-blue-600 px-4 py-2',
                        'text-sm font-medium text-white transition-colors',
                        'hover:bg-blue-700',
                        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                        'disabled:cursor-not-allowed disabled:opacity-50'
                      )}
                    >
                      {isCommitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Committing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Confirm Swap
                        </>
                      )}
                    </button>
                    {commitError && (
                      <p className="text-sm text-red-400">{commitError}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {swapStep === 'locking' && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-4" />
                <p className="text-sm font-medium text-gray-300">
                  {loadingText || 'Processing swap...'}
                </p>
                {!loadingText && (
                  <p className="text-xs text-gray-500 mt-2">Locking funds and executing payout</p>
                )}
              </div>
            )}

            {swapStep === 'pendingRefund' && (
              <div className="space-y-4">
                {loadingText ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-green-400 mb-4" />
                    <p className="text-sm font-medium text-gray-300">
                      {loadingText}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Refund claimed. Funds will appear in the next round.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mb-4" />
                      <p className="text-lg font-semibold text-yellow-400 mb-2">
                        Waiting for Timelock...
                      </p>
                      {currentBlock !== null && timeoutBlock !== null && (
                        <div className="mt-4 space-y-2 text-center">
                          <p className="text-sm text-gray-300">
                            Current Block: <span className="font-mono text-white">{currentBlock}</span>
                          </p>
                          <p className="text-sm text-gray-300">
                            Timeout Block: <span className="font-mono text-white">{timeoutBlock}</span>
                          </p>
                          <p className="text-xs text-gray-500 mt-2">
                            Blocks remaining: {Math.max(0, timeoutBlock - currentBlock)}
                          </p>
                        </div>
                      )}
                      {(currentBlock === null || timeoutBlock === null) && (
                        <p className="text-xs text-gray-500 mt-2">
                          Loading block information...
                        </p>
                      )}
                    </div>
                    {currentBlock !== null && timeoutBlock !== null && (
                      <>
                        <button
                          onClick={handleClaimRefund}
                          disabled={isClaimingRefund || currentBlock < timeoutBlock}
                          title={
                            currentBlock < timeoutBlock
                              ? `🔒 Timelock Active. Funds will unlock at Block ${timeoutBlock} (Current: ${currentBlock}).`
                              : '🔓 Timelock Expired. You can now reclaim your funds.'
                          }
                          className={cn(
                            'w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 px-4 py-2',
                            'text-sm font-medium transition-colors',
                            'focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            currentBlock < timeoutBlock
                              ? 'bg-gray-700 text-gray-400'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          )}
                        >
                          {isClaimingRefund ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Claim Refund
                            </>
                          )}
                        </button>
                        <p className="text-xs text-center text-gray-500">
                          {currentBlock < timeoutBlock
                            ? `🔒 Timelock Active. Funds will unlock at Block ${timeoutBlock} (Current: ${currentBlock}).`
                            : '🔓 Timelock Expired. You can now reclaim your funds.'}
                        </p>
                      </>
                    )}
                  </>
                )}
                {commitError && (
                  <p className="text-sm text-red-400">{commitError}</p>
                )}
              </div>
            )}

            {swapStep === 'success' && l1TxId && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mb-4" />
                  <p className="text-lg font-semibold text-green-400 mb-2">Success!</p>
                  <p className="text-sm text-gray-300 text-center mb-4">
                    Bitcoin sent to your L1 Address
                  </p>
                  <div className="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-4 overflow-hidden">
                    <p className="text-xs font-medium text-gray-400 mb-2">L1 Transaction ID:</p>
                    <p className="text-sm font-mono text-green-400 break-all overflow-wrap-anywhere">{l1TxId}</p>
                  </div>
                </div>
                <button
                  onClick={handleResetSwap}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                    'text-sm font-medium text-gray-400 transition-colors',
                    'hover:bg-gray-700 hover:text-gray-300',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900'
                  )}
                >
                  Start New Swap
                </button>
              </div>
            )}

            {swapStep === 'refundSuccess' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-8">
                  <CheckCircle2 className="h-12 w-12 text-green-400 mb-4" />
                  <p className="text-lg font-semibold text-green-400 mb-2">Refund Success!</p>
                  <p className="text-sm text-gray-300 text-center mb-4">
                    Funds returned.
                  </p>
                </div>
                <button
                  onClick={handleResetSwap}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                    'text-sm font-medium text-gray-400 transition-colors',
                    'hover:bg-gray-700 hover:text-gray-300',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900'
                  )}
                >
                  Start New Swap
                </button>
              </div>
            )}
          </div>
        </div>

        {/* KoiPond Component */}
        <KoiPond
          walletAddress={address}
          vtxos={vtxos}
          onEnterPond={handleEnterPond}
        />
      </div>
    </div>
  );
}

