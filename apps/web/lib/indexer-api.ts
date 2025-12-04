const INDEXER_BASE_URL = 'http://localhost:3002';

export interface AspInfo {
  id: string;
  name: string;
  poolAddress: string;
}

export interface Metrics {
  roundFrequency: number;
  roundCount: number;
  secondsSinceLastRound: number;
  tvl: string;
  exitVolume: string;
  treeDepth: number;
}

export interface ScoreBreakdown {
  safety: number;
  reliability: number;
  efficiency: number;
}

export interface AspStatsResponse {
  asp: AspInfo;
  score: number;
  grade: string;
  metrics: Metrics;
  breakdown: ScoreBreakdown;
}

export async function getAspStats(aspId: string): Promise<AspStatsResponse> {
  const response = await fetch(`${INDEXER_BASE_URL}/stats/${aspId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to fetch ASP stats' }));
    throw new Error(error.message || 'Failed to fetch ASP stats');
  }

  return response.json() as Promise<AspStatsResponse>;
}

export interface SimulateExitResponse {
  message: string;
  amount: string;
  tvl: string;
  percentage: number;
  aspId: string;
  aspName: string;
}

export async function simulateExit(
  percentage: number,
  aspId?: string,
): Promise<SimulateExitResponse> {
  const response = await fetch(`${INDEXER_BASE_URL}/debug/simulate-exit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ percentage, aspId }),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to simulate exit' }));
    throw new Error(error.message || 'Failed to simulate exit');
  }

  return response.json() as Promise<SimulateExitResponse>;
}

export interface ResetSimulationResponse {
  success: boolean;
  message: string;
  deletedCount: number;
}

export async function resetSimulation(): Promise<ResetSimulationResponse> {
  const response = await fetch(`${INDEXER_BASE_URL}/debug/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Failed to reset simulation' }));
    throw new Error(error.message || 'Failed to reset simulation');
  }

  return response.json() as Promise<ResetSimulationResponse>;
}
