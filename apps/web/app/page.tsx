'use client';

import { WalletProvider } from '../context/WalletContext';
import { Navbar } from '../components/Navbar';
import { Dashboard } from '../components/Dashboard';

export default function Home() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-gray-950">
        <Navbar />
        <Dashboard />
      </div>
    </WalletProvider>
  );
}

