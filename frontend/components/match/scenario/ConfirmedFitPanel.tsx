import { ConfirmedFitAdvice } from "@/lib/types/api";

interface ConfirmedFitPanelProps {
  fitScore: number;
  fitAdvice: ConfirmedFitAdvice;
  scoreColor: (score: number) => string;
}

export function ConfirmedFitPanel({ fitScore, fitAdvice, scoreColor }: ConfirmedFitPanelProps) {

  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(fitScore)}`}>{fitScore}</span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{fitAdvice.confirmation}</p>

      {fitAdvice.standoutStrengths.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What works in your favour</h3>
          <ul className="space-y-1.5">
            {fitAdvice.standoutStrengths.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fitAdvice.minorGaps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Minor gaps</h3>
          <ul className="space-y-1.5">
            {fitAdvice.minorGaps.map((g) => (
              <li key={g} className="flex gap-2 text-sm text-gray-700">
                <span className="text-gray-400">–</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

    </div>
  );
}
