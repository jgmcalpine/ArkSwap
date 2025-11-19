'use client';

import { useState, useEffect, useRef } from 'react';
import { useWallet } from '../context/WalletContext';
import { Coins, Droplets, ArrowRightLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { requestFaucet, requestSwapQuote, commitSwap, getBitcoinInfo, type SwapQuoteResponse } from '../lib/api';
import { mockArkClient } from '../lib/ark-client';
import { createSwapLock, type SwapLockResult } from '@arkswap/protocol';

type SwapStep = 'quote' | 'locking' | 'success' | 'pendingRefund' | 'refundSuccess';

export function Dashboard() {
  const { balance, isConnected, address, refreshBalance } = useWallet();
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

  const handleFaucet = async () => {
    if (!address) return;
    
    setIsLoading(true);
    setFaucetError(null);
    try {
      // 1. Call the Backend (Triggers the mining simulation and logs)
      // Make sure this port matches your NestJS API port!
      await fetch('http://localhost:3001/faucet/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      // 2. Update the Local Mock Client (Persists the balance to localStorage)
      mockArkClient.addBalance(address, 10000);
      
      // 3. Update the UI Context
      await refreshBalance(); 
      
    } catch (error) {
      console.error("Faucet failed", error);
      setFaucetError('Failed to request faucet');
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

    try {
      // 1. Send L2 transaction (lock funds)
      const l2TxId = await mockArkClient.send(amount, lockAddress);

      // 2. Update balance (deduct the locked amount)
      mockArkClient.addBalance(address, -amount);
      await refreshBalance();

      // 3. Check Chaos Mode
      if (chaosMode) {
        // Simulate backend crash - don't call commitSwap
        // Get current block to calculate timeout
        try {
          const bitcoinInfo = await getBitcoinInfo();
          const current = bitcoinInfo.blocks;
          const timeoutBlocks = 20; // From createSwapLock
          setStartBlock(current);
          setCurrentBlock(current);
          setTimeoutBlock(current + timeoutBlocks);
          setSwapStep('pendingRefund');
        } catch (err) {
          console.error("Failed to get bitcoin info", err);
          // Fallback: use a default start block
          setStartBlock(0);
          setCurrentBlock(0);
          setTimeoutBlock(20);
          setSwapStep('pendingRefund');
        }
      } else {
        // Normal flow: Commit swap to backend
        const commitResponse = await commitSwap(quote.id, l2TxId, userL1Address.trim());

        // 4. Show success
        setL1TxId(commitResponse.l1TxId);
        setSwapStep('success');
      }
    } catch (err) {
      console.error("Swap commit failed", err);
      setCommitError(err instanceof Error ? err.message : 'Failed to commit swap');
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
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const handleClaimRefund = async () => {
    if (!address || !lockResult) return;

    const amount = parseFloat(swapAmount);
    if (isNaN(amount) || amount <= 0) {
      return;
    }

    setIsClaimingRefund(true);
    try {
      await mockArkClient.claimRefund(amount, address);
      await refreshBalance();
      setSwapStep('refundSuccess');
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    } catch (err) {
      console.error("Refund claim failed", err);
      setCommitError(err instanceof Error ? err.message : 'Failed to claim refund');
    } finally {
      setIsClaimingRefund(false);
    }
  };

  // Poll for current block when in pending refund state
  useEffect(() => {
    if (swapStep === 'pendingRefund' && timeoutBlock !== null) {
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
    }
  }, [swapStep, timeoutBlock]);

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
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="space-y-6">
        {/* Balance Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-400">Your Ark Balance</h2>
              <p className="mt-2 text-3xl font-bold text-white">
                {balance.toLocaleString()} <span className="text-xl text-gray-400">ARK</span>
              </p>
              {address && (
                <p className="mt-2 text-xs font-mono text-gray-500">{address}</p>
              )}
            </div>
            <div className="rounded-full bg-blue-500/10 p-4">
              <Coins className="h-8 w-8 text-blue-400" />
            </div>
          </div>
        </div>

        {/* Faucet Card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-400">Get Test Tokens</h3>
              <p className="mt-1 text-sm text-gray-500">
                Request tokens from the faucet to test the swap functionality
              </p>
              {faucetError && (
                <p className="mt-2 text-sm text-red-400">{faucetError}</p>
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
                'disabled:cursor-not-allowed disabled:opacity-50'
              )}
            >
              <Droplets className="h-4 w-4" />
              {isLoading ? 'Processing...' : 'Get Mock Ark'}
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
                <div className="flex gap-3">
                  <input
                    type="number"
                    value={swapAmount}
                    onChange={(e) => setSwapAmount(e.target.value)}
                    placeholder="Amount to swap"
                    min="0"
                    step="0.01"
                    className={cn(
                      'flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                      'text-sm text-gray-300 placeholder-gray-500',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                    )}
                  />
                  <button
                    onClick={handleRequestQuote}
                    disabled={isRequestingQuote || !swapAmount}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2',
                      'text-sm font-medium text-gray-400 transition-colors',
                      'hover:bg-gray-700 hover:text-gray-300',
                      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900',
                      'disabled:cursor-not-allowed disabled:opacity-50'
                    )}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    {isRequestingQuote ? 'Requesting...' : 'Request Quote'}
                  </button>
                </div>
                {quoteError && (
                  <p className="text-sm text-red-400">{quoteError}</p>
                )}
                {lockAddress && quote && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                      <p className="text-xs font-medium text-gray-400 mb-2">Lock Address:</p>
                      <p className="text-sm font-mono text-green-400 break-all">{lockAddress}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-400">
                        Your L1 Address (where you want to receive BTC)
                      </label>
                      <input
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
                      disabled={isCommitting || !userL1Address.trim()}
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
                <p className="text-sm font-medium text-gray-300">Processing swap...</p>
                <p className="text-xs text-gray-500 mt-2">Locking funds and executing payout</p>
              </div>
            )}

            {swapStep === 'pendingRefund' && (
              <div className="space-y-4">
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-400 mb-4" />
                  <p className="text-lg font-semibold text-yellow-400 mb-2">
                    Swap Locked. Waiting for Timeout...
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
                  <div className="w-full rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                    <p className="text-xs font-medium text-gray-400 mb-2">L1 Transaction ID:</p>
                    <p className="text-sm font-mono text-green-400 break-all">{l1TxId}</p>
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

