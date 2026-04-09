import { NarrativeGapAdvice } from "@/lib/types/api";

interface NarrativeGapPanelProps {
  fitScore: number;
  fitAdvice: NarrativeGapAdvice;
  scoreColor: (score: number) => string;
}

export function NarrativeGapPanel({ fitScore, fitAdvice, scoreColor }: NarrativeGapPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(fitScore)}`}>{fitScore}</span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed italic">{fitAdvice.narrativeBridge}</p>

      {fitAdvice.transferableStrengths.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What transfers directly</h3>
          <ul className="space-y-1.5">
            {fitAdvice.transferableStrengths.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fitAdvice.reframingSuggestions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">How to frame your experience</h3>
          <ul className="space-y-1.5">
            {fitAdvice.reframingSuggestions.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-gray-700">
                <span className="text-gray-400">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fitAdvice.missingSkills.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Gaps to address</h3>
          <div className="flex flex-wrap gap-1.5">
            {fitAdvice.missingSkills.map((s) => (
              <span key={s} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
