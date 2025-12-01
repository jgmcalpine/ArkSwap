'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mockArkClient } from '@arkswap/client';
import type { Vtxo, AssetMetadata } from '@arkswap/protocol';

// Extended VTXO type that may include asset metadata
type ExtendedVtxo = Vtxo & { metadata?: AssetMetadata; assetId?: string };

interface WalletContextType {
  address: string | null;
  // Total balance including assets
  balance: number;
  // Spendable balance for payments (excludes asset VTXOs)
  paymentBalance: number;
  vtxos: ExtendedVtxo[];
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
        console.error('Wallet load error', e);
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
        return { balance: 0, paymentBalance: 0, vtxos: [] as ExtendedVtxo[] };
      }
      await mockArkClient.fetchFromASP(address);

      // Get VTXOs from main address
      const mainVtxos = mockArkClient.getVtxos(address);

      // Get VTXOs from all watched addresses (asset addresses)
      const watchedAddresses = mockArkClient.getWatchedAddresses();
      const watchedVtxos = watchedAddresses.flatMap((addr) =>
        mockArkClient.getVtxos(addr),
      );

      // Combine all VTXOs (main + watched)
      const allVtxos = [...mainVtxos, ...watchedVtxos];

      // Calculate balances from combined VTXOs
      const balance = allVtxos.reduce((sum, vtxo) => sum + vtxo.amount, 0);
      const paymentBalance = allVtxos
        .filter((vtxo) => !vtxo.metadata)
        .reduce((sum, vtxo) => sum + vtxo.amount, 0);

      return {
        balance,
        paymentBalance,
        vtxos: allVtxos,
      };
    },
    refetchInterval: 5000,
  });

  const balance = data?.balance ?? 0;
  const paymentBalance = data?.paymentBalance ?? 0;
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
        paymentBalance,
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
