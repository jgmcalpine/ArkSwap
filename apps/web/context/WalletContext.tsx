'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { mockArkClient } from '../lib/ark-client';

interface WalletContextType {
  address: string | null;
  balance: number;
  isConnected: boolean;
  isLoading: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load address from wallet on mount (client-side only)
  useEffect(() => {
    // Ensure we're in the browser
    if (typeof window === 'undefined') {
      setIsLoading(false);
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
          setBalance(mockArkClient.getBalance(storedAddress));
        } else {
          // No wallet found - stay disconnected
          setIsConnected(false);
          setAddress(null);
          setBalance(0);
        }
      } catch (e) {
        console.error("Wallet load error", e);
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadWallet();
  }, []);

  const connect = useCallback(async () => {
    try {
      const newAddress = await mockArkClient.createWallet();
      setAddress(newAddress);
      setIsConnected(true);
      setBalance(mockArkClient.getBalance(newAddress));
    } catch (error) {
      console.error('Failed to create wallet:', error);
      setIsConnected(false);
      setAddress(null);
      setBalance(0);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setIsConnected(false);
    setBalance(0);
    // Note: WIF is stored in MockArkClient, not here
    // For a full disconnect, we'd need to clear it from MockArkClient
  }, []);

  const refreshBalance = useCallback(async () => {
    if (address) {
      // Balance is synchronous, but we keep it async for consistency
      setBalance(mockArkClient.getBalance(address));
    }
  }, [address]);

  return (
    <WalletContext.Provider
      value={{
        address,
        balance,
        isConnected,
        isLoading,
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

