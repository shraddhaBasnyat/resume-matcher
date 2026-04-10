import { MatchResponse } from "@/lib/types/api";

interface AtsPanelProps {
  atsProfile: MatchResponse["atsProfile"];
}

export function AtsPanel({ atsProfile }: AtsPanelProps) {
  const { atsScore, missingKeywords, terminologyGaps, layoutFlags } = atsProfile;
  const hasContent =
    atsScore !== null ||
    missingKeywords.length > 0 ||
    terminologyGaps.length > 0 ||
    layoutFlags.length > 0;

  if (!hasContent) return null;

  return (
    <details className="group border border-gray-200 rounded-lg">
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 select-none">
        ATS compatibility
        <span className="text-gray-400 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 space-y-4 text-sm">
        {atsScore !== null ? (
          <p className="text-gray-700">
            ATS score: <span className="font-semibold">{atsScore}/100</span>
          </p>
        ) : (
          <p className="text-gray-400 italic">ATS score pending</p>
        )}

        {missingKeywords.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Missing keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {missingKeywords.map((kw) => (
                <span key={kw} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{kw}</span>
              ))}
            </div>
          </div>
        )}

        {terminologyGaps.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Terminology gaps</p>
            <ul className="space-y-1 text-gray-700">
              {terminologyGaps.map((gap) => (
                <li key={gap} className="flex gap-2"><span className="text-gray-400">–</span>{gap}</li>
              ))}
            </ul>
          </div>
        )}

        {layoutFlags.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Layout flags</p>
            <ul className="space-y-1 text-gray-700">
              {layoutFlags.map((flag) => (
                <li key={flag} className="flex gap-2"><span className="text-gray-400">–</span>{flag}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
