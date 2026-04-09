import {
  MatchResponse,
  ConfirmedFitAdvice,
  InvisibleExpertAdvice,
  NarrativeGapAdvice,
  HonestVerdictAdvice,
} from "@/lib/types/api";
import { ConfirmedFitPanel } from "@/components/match/scenario/ConfirmedFitPanel";
import { InvisibleExpertPanel } from "@/components/match/scenario/InvisibleExpertPanel";
import { NarrativeGapPanel } from "@/components/match/scenario/NarrativeGapPanel";
import { HonestVerdictPanel } from "@/components/match/scenario/HonestVerdictPanel";

interface MatchResultProps {
  result: MatchResponse;
  scoreColor: (score: number) => string;
}

function FallbackPanel({ result, scoreColor }: MatchResultProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(result.fitScore)}`}>{result.fitScore}</span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      {result.narrativeAlignment && (
        <p className="text-sm text-gray-700 italic leading-relaxed">{result.narrativeAlignment}</p>
      )}

      {result.matchedSkills.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Matched skills</h3>
          <div className="flex flex-wrap gap-1.5">
            {result.matchedSkills.map((s) => (
              <span key={s} className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">{s}</span>
            ))}
          </div>
        </div>
      )}

      {result.missingSkills.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Missing skills</h3>
          <div className="flex flex-wrap gap-1.5">
            {result.missingSkills.map((s) => (
              <span key={s} className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">{s}</span>
            ))}
          </div>
        </div>
      )}

      {result.weakMatch && result.weakMatchReason && (
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
          {result.weakMatchReason}
        </p>
      )}
    </div>
  );
}

export function MatchResult({ result, scoreColor }: MatchResultProps) {
  let panel: React.ReactNode;

  if (!result.scenarioId || !result.fitAdvice) {
    panel = <FallbackPanel result={result} scoreColor={scoreColor} />;
  } else {
    const advice = result.fitAdvice;
    switch (result.scenarioId) {
      case "confirmed_fit":
        panel = (
          <ConfirmedFitPanel
            fitScore={result.fitScore}
            fitAdvice={advice as ConfirmedFitAdvice}
            atsProfile={result.atsProfile}
            scoreColor={scoreColor}
          />
        );
        break;
      case "invisible_expert":
        panel = (
          <InvisibleExpertPanel
            fitScore={result.fitScore}
            fitAdvice={advice as InvisibleExpertAdvice}
            scoreColor={scoreColor}
          />
        );
        break;
      case "narrative_gap":
        panel = (
          <NarrativeGapPanel
            fitScore={result.fitScore}
            fitAdvice={advice as NarrativeGapAdvice}
            scoreColor={scoreColor}
          />
        );
        break;
      case "honest_verdict":
        panel = (
          <HonestVerdictPanel
            fitScore={result.fitScore}
            fitAdvice={advice as HonestVerdictAdvice}
            scoreColor={scoreColor}
          />
        );
        break;
    }
  }

  return (
    <div className="space-y-6">
      {panel}

      {result._meta.traceUrl && (
        <a
          href={result._meta.traceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
        >
          View trace in LangSmith
        </a>
      )}
    </div>
  );
}
