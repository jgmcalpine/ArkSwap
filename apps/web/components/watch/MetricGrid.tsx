'use client';

import { TrendingUp, Clock, ArrowUpRight, Layers } from 'lucide-react';
import type { Metrics } from '../../lib/indexer-api';

interface MetricGridProps {
  metrics: Metrics;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}

function MetricCard({ label, value, icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-400">{label}</p>
          <p className="mt-1 text-xl font-bold text-white">{value}</p>
        </div>
        <div className="flex-shrink-0 text-gray-600">{icon}</div>
      </div>
    </div>
  );
}

function formatTvl(tvl: string): string {
  const num = BigInt(tvl);
  if (num >= 1_000_000_000n) {
    return `${(Number(num) / 1_000_000_000).toFixed(2)}B sats`;
  }
  if (num >= 1_000_000n) {
    return `${(Number(num) / 1_000_000).toFixed(2)}M sats`;
  }
  if (num >= 1_000n) {
    return `${(Number(num) / 1_000).toFixed(2)}K sats`;
  }
  return `${num.toString()} sats`;
}

function formatExitVolume(exitVolume: string): string {
  return formatTvl(exitVolume);
}

function formatRoundFrequency(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)}m`;
  }
  return `${(seconds / 3600).toFixed(2)}h`;
}

export function MetricGrid({ metrics }: MetricGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="TVL"
        value={formatTvl(metrics.tvl)}
        icon={<TrendingUp className="h-5 w-5" />}
      />
      <MetricCard
        label="Round Freq"
        value={formatRoundFrequency(metrics.roundFrequency)}
        icon={<Clock className="h-5 w-5" />}
      />
      <MetricCard
        label="Exit Vol"
        value={formatExitVolume(metrics.exitVolume)}
        icon={<ArrowUpRight className="h-5 w-5" />}
      />
      <MetricCard
        label="Tree Depth"
        value={metrics.treeDepth}
        icon={<Layers className="h-5 w-5" />}
      />
    </div>
  );
}
