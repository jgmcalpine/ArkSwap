const API_BASE_URL = 'http://localhost:3001';

interface FaucetUserRequest {
  address: string;
}

interface FaucetUserResponse {
  success: boolean;
  amount: number;
}

export async function requestFaucet(
  address: string,
): Promise<FaucetUserResponse> {
  const response = await fetch(`${API_BASE_URL}/faucet/user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address } as FaucetUserRequest),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to request faucet' }));
    throw new Error(error.message || 'Failed to request faucet');
  }

  return response.json() as Promise<FaucetUserResponse>;
}

interface SwapQuoteRequest {
  amount: number;
}

export interface SwapQuoteResponse {
  id: string;
  amount: number;
  preimageHash: string;
  makerPubkey: string;
}

export async function requestSwapQuote(
  amount: number,
): Promise<SwapQuoteResponse> {
  const response = await fetch(`${API_BASE_URL}/swap/quote`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount } as SwapQuoteRequest),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to request swap quote' }));
    throw new Error(error.message || 'Failed to request swap quote');
  }

  return response.json() as Promise<SwapQuoteResponse>;
}

interface SwapCommitRequest {
  swapId: string;
  txid: string;
  userL1Address: string;
}

export interface SwapCommitResponse {
  success: boolean;
  l1TxId: string;
}

export async function commitSwap(
  swapId: string,
  txid: string,
  userL1Address: string,
): Promise<SwapCommitResponse> {
  const response = await fetch(`${API_BASE_URL}/swap/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ swapId, txid, userL1Address } as SwapCommitRequest),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to commit swap' }));
    throw new Error(error.message || 'Failed to commit swap');
  }

  return response.json() as Promise<SwapCommitResponse>;
}

export interface BitcoinInfoResponse {
  chain: string;
  blocks: number;
  headers: number;
}

export async function getBitcoinInfo(): Promise<BitcoinInfoResponse> {
  const response = await fetch(`${API_BASE_URL}/bitcoin/info`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to get bitcoin info' }));
    throw new Error(error.message || 'Failed to get bitcoin info');
  }

  return response.json() as Promise<BitcoinInfoResponse>;
}
