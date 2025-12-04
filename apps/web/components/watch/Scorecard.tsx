'use client';

import { cn } from '../../lib/utils';

interface ScorecardProps {
  grade: string;
  score: number;
}

const gradeColors: Record<string, string> = {
  A: 'bg-green-500/20 border-green-500 text-green-400',
  B: 'bg-blue-500/20 border-blue-500 text-blue-400',
  C: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
  D: 'bg-orange-500/20 border-orange-500 text-orange-400',
  F: 'bg-red-500/20 border-red-500 text-red-400',
};

export function Scorecard({ grade, score }: ScorecardProps) {
  const gradeColor = gradeColors[grade] || gradeColors.F;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 backdrop-blur-sm">
      <div className="flex flex-col items-center justify-center space-y-4">
        <div
          className={cn(
            'rounded-full border-4 p-8 text-6xl font-bold',
            gradeColor,
          )}
        >
          {grade}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-400">Score</p>
          <p className="mt-1 text-3xl font-bold text-white">
            {score.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
}
