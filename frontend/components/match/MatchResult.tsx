import { MatchResponse } from "@/lib/match-constants";

interface MatchResultProps {
  result: MatchResponse;
  scoreColor: (score: number) => string;
}

export function MatchResult({
  result,
  scoreColor,
}: MatchResultProps) {
  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(result.fitScore)}`}>
          {result.fitScore}
        </span>
        <span className="text-2xl text-gray-400">/ 100</span>
      </div>

      {/* Narrative */}
      {result.narrativeAlignment && (
        <p className="text-sm text-gray-700 italic leading-relaxed">
          {result.narrativeAlignment}
        </p>
      )}

      {/* Matched skills */}
      {result.matchedSkills.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Matched Skills</h3>
          <div className="flex flex-wrap gap-2">
            {result.matchedSkills.map((s: string) => (
              <span key={s} className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing skills */}
      {result.missingSkills.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Missing Skills</h3>
          <div className="flex flex-wrap gap-2">
            {result.missingSkills.map((s: string) => (
              <span key={s} className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Weak match reason */}
      {result.weakMatch && result.weakMatchReason && (
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
          {result.weakMatchReason}
        </p>
      )}

      {/* LangSmith trace link */}
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
