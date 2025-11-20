'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mockArkClient } from '../lib/ark-client';
import type { Vtxo } from '@arkswap/protocol';

interface WalletContextType {
  address: string | null;
  balance: number;
  vtxos: Vtxo[];
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();

  // Load address from wallet on mount (client-side only)
  useEffect(() => {
    // Ensure we're in the browser
    if (typeof window === 'undefined') {
      setIsInitialLoading(false);
      return;
    }

    // Async function to load wallet
    const loadWallet = async () => {
      try {
        // This now returns string | null
        const storedAddress = await mockArkClient.getAddress();
        
        if (storedAddress) {
          setAddress(storedAddress);
          setIsConnected(true);
        } else {
          // No wallet found - stay disconnected
          setIsConnected(false);
          setAddress(null);
        }
      } catch (e) {
        console.error("Wallet load error", e);
        setIsConnected(false);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadWallet();
  }, []);

  // React Query for wallet data
  const { data, isLoading } = useQuery({
    queryKey: ['wallet-data', address],
    enabled: !!address,
    queryFn: async () => {
      if (!address) {
        return { balance: 0, vtxos: [] };
      }
      await mockArkClient.fetchFromASP(address);
      return {
        balance: mockArkClient.getBalance(address),
        vtxos: mockArkClient.getVtxos(address),
      };
    },
    refetchInterval: 5000,
  });

  const balance = data?.balance ?? 0;
  const vtxos = data?.vtxos ?? [];
  const isLoadingWallet = isLoading || isInitialLoading;

  const connect = useCallback(async () => {
    try {
      const newAddress = await mockArkClient.createWallet();
      setAddress(newAddress);
      setIsConnected(true);
    } catch (error) {
      console.error('Failed to create wallet:', error);
      setIsConnected(false);
      setAddress(null);
    }
  }, []);

  const disconnect = useCallback(() => {
    // Clear localStorage data (WIF and VTXOs)
    mockArkClient.clearWallet();
    // Clear React state
    setAddress(null);
    setIsConnected(false);
    // Invalidate queries to clear cached data
    queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
  }, [queryClient]);

  const refreshBalance = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
  }, [queryClient]);

  return (
    <WalletContext.Provider
      value={{
        address,
        balance,
        vtxos,
        isConnected,
        isLoading: isLoadingWallet,
        connect,
        disconnect,
        refreshBalance,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

