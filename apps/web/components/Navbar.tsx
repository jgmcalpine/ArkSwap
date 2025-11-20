'use client';

import { useWallet } from '../context/WalletContext';
import { Wallet } from 'lucide-react';
import { cn } from '../lib/utils';

export function Navbar() {
  const { address, balance, isConnected, connect, disconnect } = useWallet();
  
  const handleConnect = async () => {
    await connect();
  };

  const truncateAddress = (addr: string): string => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <nav className="w-full border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm overflow-x-hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8 w-full min-w-0">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-blue-400" />
          <h1 className="text-xl font-bold text-white">ArkSwap</h1>
        </div>

        <div className="flex items-center gap-4">
          {isConnected ? (
            <>
              <div className="hidden items-center gap-3 sm:flex">
                <div className="flex flex-col items-end">
                  <span className="text-xs text-gray-400">Balance</span>
                  <span className="text-sm font-semibold text-white">
                    {balance.toLocaleString()} ARK
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2">
                  <Wallet className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-mono text-gray-300">
                    {truncateAddress(address!)}
                  </span>
                </div>
              </div>
              <button
                onClick={disconnect}
                className={cn(
                  'rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium',
                  'text-gray-300 transition-colors hover:bg-gray-700 hover:text-white',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900'
                )}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button
              onClick={handleConnect}
              className={cn(
                'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white',
                'transition-colors hover:bg-blue-700',
                'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900'
              )}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

