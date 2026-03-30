import { MatchResponse } from "@/lib/match-constants";

interface MatchResultProps {
  result: MatchResponse;
  showResumeData: boolean;
  showJobData: boolean;
  onToggleResumeData: (open: boolean) => void;
  onToggleJobData: (open: boolean) => void;
  scoreColor: (score: number) => string;
}

export function MatchResult({
  result,
  showResumeData,
  showJobData,
  onToggleResumeData,
  onToggleJobData,
  scoreColor,
}: MatchResultProps) {
  return (
    <div className="space-y-6">
      {/* Score */}
      <div className="flex items-baseline gap-2">
        <span className={`text-6xl font-bold ${scoreColor(result.score)}`}>
          {result.score}
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
            {result.matchedSkills.map((s) => (
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
            {result.missingSkills.map((s) => (
              <span key={s} className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {result.gaps.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Gaps</h3>
          <ul className="list-disc list-inside space-y-1">
            {result.gaps.map((gap, i) => (
              <li key={i} className="text-sm text-gray-600">
                {gap}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resume advice */}
      {result.resumeAdvice.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Resume Advice</h3>
          <ol className="list-decimal list-inside space-y-1">
            {result.resumeAdvice.map((advice, i) => (
              <li key={i} className="text-sm text-gray-700">
                {advice}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Weak match reason */}
      {result.weakMatch && result.weakMatchReason && (
        <p className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
          {result.weakMatchReason}
        </p>
      )}

      {/* Collapsible: how resume was parsed */}
      <details
        open={showResumeData}
        onToggle={(e) => onToggleResumeData((e.target as HTMLDetailsElement).open)}
        className="border border-gray-200 rounded"
      >
        <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-600 select-none">
          How your resume was parsed
        </summary>
        <pre className="p-4 text-xs bg-gray-50 overflow-auto max-h-80 border-t border-gray-200">
          {JSON.stringify(result.resumeData, null, 2)}
        </pre>
      </details>

      {/* Collapsible: how job was parsed */}
      <details
        open={showJobData}
        onToggle={(e) => onToggleJobData((e.target as HTMLDetailsElement).open)}
        className="border border-gray-200 rounded"
      >
        <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-600 select-none">
          How the job was parsed
        </summary>
        <pre className="p-4 text-xs bg-gray-50 overflow-auto max-h-80 border-t border-gray-200">
          {JSON.stringify(result.jobData, null, 2)}
        </pre>
      </details>

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
