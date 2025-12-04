'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, MapPin } from 'lucide-react';
import { getAspStats } from '../../lib/indexer-api';
import { Scorecard } from './Scorecard';
import { MetricGrid } from './MetricGrid';

export function WatchView() {
  const [aspId, setAspId] = useState<string>('local-asp');

  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['asp-stats', aspId],
    queryFn: () => getAspStats(aspId),
    refetchInterval: 10000, // Refetch every 10 seconds
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
          <Scorecard grade={stats.grade} score={stats.score} />
          <MetricGrid metrics={stats.metrics} />
        </>
      )}
    </div>
  );
}
