'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle, MapPin, RefreshCw } from 'lucide-react';
import {
  getAspStats,
  simulateExit,
  resetSimulation,
} from '../../lib/indexer-api';
import { Scorecard } from './Scorecard';
import { MetricGrid } from './MetricGrid';

export function WatchView() {
  const [aspId, setAspId] = useState<string>('local-asp');
  const queryClient = useQueryClient();

  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['asp-stats', aspId],
    queryFn: () => getAspStats(aspId),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const simulateMutation = useMutation({
    mutationFn: () => simulateExit(25, aspId),
    onSuccess: () => {
      // Refetch stats after simulation
      queryClient.invalidateQueries({ queryKey: ['asp-stats', aspId] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => resetSimulation(),
    onSuccess: () => {
      // Refetch stats after reset
      refetch();
    },
  });

  return (
    <div className="space-y-6">
      {/* ASP ID Input */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="asp-id"
              className="block text-sm font-medium text-gray-400 mb-2"
            >
              ASP ID
            </label>
            <input
              id="asp-id"
              type="text"
              value={aspId}
              onChange={(e) => setAspId(e.target.value)}
              placeholder="Enter ASP ID"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-4" />
          <p className="text-sm font-medium text-gray-300">
            Loading ASP statistics...
          </p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red-800 bg-red-900/20 p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="mt-1 text-sm text-red-300">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load ASP statistics'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Display */}
      {stats && !isLoading && !error && (
        <>
          {/* ASP Info Card */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-gray-400" />
                <h3 className="text-sm font-medium text-gray-400">
                  ASP Information
                </h3>
              </div>
              {stats.asp.name && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Name</p>
                  <p className="text-sm font-semibold text-white">
                    {stats.asp.name}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">
                  Pool Address
                </p>
                <p className="text-sm font-mono text-blue-400 break-all">
                  {stats.asp.poolAddress}
                </p>
              </div>
            </div>
          </div>
          <Scorecard
            grade={stats.grade}
            score={stats.score}
            metrics={stats.metrics}
          />
          <MetricGrid metrics={stats.metrics} />
          {/* Simulate Bank Run and Reset Buttons */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => simulateMutation.mutate()}
                disabled={simulateMutation.isPending || resetMutation.isPending}
                className="w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {simulateMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Simulating...
                  </span>
                ) : (
                  '🔥 Simulate 25% Bank Run'
                )}
              </button>
              <button
                type="button"
                onClick={() => resetMutation.mutate()}
                disabled={simulateMutation.isPending || resetMutation.isPending}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3 text-sm font-semibold text-gray-300 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Resetting...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Reset Stats
                  </span>
                )}
              </button>
              {simulateMutation.isError && (
                <p className="text-sm text-red-400">
                  {simulateMutation.error instanceof Error
                    ? simulateMutation.error.message
                    : 'Failed to simulate exit'}
                </p>
              )}
              {simulateMutation.isSuccess && (
                <p className="text-sm text-green-400">
                  {simulateMutation.data.message}
                </p>
              )}
              {resetMutation.isError && (
                <p className="text-sm text-red-400">
                  {resetMutation.error instanceof Error
                    ? resetMutation.error.message
                    : 'Failed to reset simulation'}
                </p>
              )}
              {resetMutation.isSuccess && (
                <p className="text-sm text-green-400">
                  {resetMutation.data.message}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
