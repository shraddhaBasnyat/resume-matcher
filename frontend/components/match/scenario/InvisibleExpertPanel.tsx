import { InvisibleExpertAdvice } from "@/lib/types/api";

interface InvisibleExpertPanelProps {
  fitScore: number;
  fitAdvice: InvisibleExpertAdvice;
  scoreColor: (score: number) => string;
}

export function InvisibleExpertPanel({ fitScore, fitAdvice, scoreColor }: InvisibleExpertPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(fitScore)}`}>{fitScore}</span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{fitAdvice.confirmation}</p>

      {fitAdvice.standoutStrengths.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What you bring</h3>
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

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">The real issue: ATS terminology</h3>
        <p className="text-sm text-amber-900 leading-relaxed">{fitAdvice.atsRealityCheck}</p>
      </div>

      {fitAdvice.terminologySwaps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Terminology to swap in</h3>
          <ul className="space-y-1.5">
            {fitAdvice.terminologySwaps.map((swap) => (
              <li key={swap} className="flex gap-2 text-sm text-gray-700">
                <span className="text-gray-400">→</span>
                {swap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fitAdvice.keywordsToAdd.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Keywords to add</h3>
          <div className="flex flex-wrap gap-1.5">
            {fitAdvice.keywordsToAdd.map((kw) => (
              <span key={kw} className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded text-xs">{kw}</span>
            ))}
          </div>
        </div>
      )}

      {fitAdvice.layoutAdvice.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Layout</h3>
          <ul className="space-y-1.5">
            {fitAdvice.layoutAdvice.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-gray-700">
                <span className="text-gray-400">–</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
