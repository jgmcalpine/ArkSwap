'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { Coins, Droplets, ArrowRightLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { requestFaucet, requestSwapQuote, commitSwap, getBitcoinInfo, type SwapQuoteResponse } from '../lib/api';
import { mockArkClient } from '../lib/ark-client';
import { createSwapLock, type SwapLockResult, type Vtxo } from '@arkswap/protocol';

type SwapStep = 'quote' | 'locking' | 'success' | 'pendingRefund' | 'refundSuccess';

export function Dashboard() {
  const { balance, isConnected, address, refreshBalance, vtxos } = useWallet();
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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedVtxos, setSelectedVtxos] = useState<string[]>([]);
  const [isManualSelection, setIsManualSelection] = useState(false);
  const [liftStatus, setLiftStatus] = useState<string | null>(null);
  const previousBalanceRef = useRef<number>(balance);
  const l1AddressInputRef = useRef<HTMLInputElement | null>(null);
  const [loadingText, setLoadingText] = useState<string | null>(null);

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
      setFaucetError('Failed to initiate deposit');
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
      const quoteData = await requestSwapQuote(amount);

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
      setQuoteError(err instanceof Error ? err.message : 'Failed to request quote');
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
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        await refreshBalance(); // Force fetch from ASP
        
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
          const bitcoinInfo = await getBitcoinInfo();
          const current = bitcoinInfo.blocks;
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
      setCommitError(err instanceof Error ? err.message : 'Failed to commit swap');
      setLoadingText(null);
      setSwapStep('quote');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleResetSwap = () => {
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
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
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

    const selected = mockArkClient.selectCoins(address, amount);
    setSelectedVtxos(selected.map(v => v.txid));
  }, [swapAmount, address, isManualSelection]);

  // Calculate selected total
  const selectedTotal = vtxos
    .filter(v => selectedVtxos.includes(v.txid))
    .reduce((sum, v) => sum + v.amount, 0);

  const requiredAmount = parseFloat(swapAmount) || 0;
  const hasInsufficientFunds = requiredAmount > 0 && selectedTotal < requiredAmount;

  // Toggle VTXO selection
  const toggleVtxo = (txid: string) => {
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
      
      // Stop block polling
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      // Wait for Round Finalization - poll until balance updates
      setLoadingText('Waiting for Round Finalization...');
      
      // Capture initial balance before the refund
      const initialBalance = balance;
      let attempts = 0;
      const maxAttempts = 10;
      
      // Poll until balance increases (refund VTXO has arrived) or timeout
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        await refreshBalance(); // Force fetch from ASP
        
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
      setCommitError(err instanceof Error ? err.message : 'Failed to claim refund');
      setLoadingText(null);
    } finally {
      setIsClaimingRefund(false);
    }
  };

  // Poll for current block when in pending refund state
  useEffect(() => {
    if (swapStep === 'pendingRefund') {
      const pollBlock = async () => {
        try {
          const bitcoinInfo = await getBitcoinInfo();
          setCurrentBlock(bitcoinInfo.blocks);
        } catch (err) {
          console.error("Failed to poll bitcoin info", err);
        }
      };

      // Poll immediately and then every 5 seconds
      pollBlock();
      pollingIntervalRef.current = setInterval(pollBlock, 5000);

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };
    } else {
      // Clear polling when not in pendingRefund state
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [swapStep]);

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
                {vtxos.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-400">Available Coins</h4>
                      {isManualSelection && (
                        <button
                          onClick={() => {
                            setIsManualSelection(false);
                            const amount = parseFloat(swapAmount);
                            if (!isNaN(amount) && amount > 0 && address) {
                              const selected = mockArkClient.selectCoins(address, amount);
                              setSelectedVtxos(selected.map(v => v.txid));
                            }
                          }}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          Reset to Auto-Select
                        </button>
                      )}
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {vtxos.map((vtxo) => {
                        const isSelected = selectedVtxos.includes(vtxo.txid);
                        return (
                          <button
                            key={vtxo.txid}
                            type="button"
                            onClick={() => toggleVtxo(vtxo.txid)}
                            className={cn(
                              'w-full flex items-center justify-between rounded-lg border p-3 text-left',
                              'transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500',
                              isSelected
                                ? 'border-green-500 bg-green-500/10'
                                : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-300">
                                  {vtxo.amount.toLocaleString()} sats
                                </span>
                                {isSelected && (
                                  <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-xs font-mono text-gray-500 truncate mt-1">
                                {vtxo.txid.slice(0, 16)}...{vtxo.txid.slice(-8)}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
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
                )}
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
      </div>
    </div>
  );
}

