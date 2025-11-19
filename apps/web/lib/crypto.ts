import { ECPairFactory, ECPairAPI } from 'ecpair';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';

interface WalletTools {
  ECPair: ECPairAPI;
  bitcoin: typeof bitcoin;
  network: typeof bitcoin.networks.regtest;
}

// Synchronous initialization (Safe because it's pure JS)
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
const network = bitcoin.networks.regtest;

// Export the tools directly
export const walletTools: WalletTools = {
  ECPair,
  bitcoin,
  network,
};
