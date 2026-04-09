import { ConfirmedFitAdvice, MatchResponse } from "@/lib/types/api";
import { AtsPanel } from "@/components/match/AtsPanel";

interface ConfirmedFitPanelProps {
  fitScore: number;
  fitAdvice: ConfirmedFitAdvice;
  atsProfile: MatchResponse["atsProfile"];
  scoreColor: (score: number) => string;
}

export function ConfirmedFitPanel({ fitScore, fitAdvice, atsProfile, scoreColor }: ConfirmedFitPanelProps) {
  const showAts =
    atsProfile.atsScore !== null ||
    atsProfile.missingKeywords.length > 0 ||
    atsProfile.terminologyGaps.length > 0 ||
    atsProfile.layoutFlags.length > 0;

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

      {showAts && <AtsPanel atsProfile={atsProfile} />}
    </div>
  );
}
