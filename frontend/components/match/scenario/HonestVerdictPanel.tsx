import { HonestVerdictAdvice } from "@/lib/types/api";

interface HonestVerdictPanelProps {
  fitScore: number;
  fitAdvice: HonestVerdictAdvice;
  scoreColor: (score: number) => string;
}

export function HonestVerdictPanel({ fitScore, fitAdvice, scoreColor }: HonestVerdictPanelProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(fitScore)}`}>{fitScore}</span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      <p className="text-sm text-gray-800 leading-relaxed">{fitAdvice.honestAssessment}</p>

      {fitAdvice.closingSteps.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Concrete next steps</h3>
          <ol className="space-y-1.5 list-none">
            {fitAdvice.closingSteps.map((step, i) => (
              <li key={step} className="flex gap-3 text-sm text-gray-700">
                <span className="text-gray-400 tabular-nums">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {fitAdvice.hitlFired && fitAdvice.acknowledgement && (
        <p className="text-sm text-gray-600 italic border-l-2 border-gray-200 pl-3">
          {fitAdvice.acknowledgement}
        </p>
      )}
    </div>
  );
}
