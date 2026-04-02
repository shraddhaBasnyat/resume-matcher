interface HitlFormProps {
  interruptedScore: number | null;
  humanContext: string;
  onHumanContextChange: (v: string) => void;
  onRescore: (e: React.FormEvent) => void;
  onAccept: () => void;
}

export function HitlForm({
  interruptedScore,
  humanContext,
  onHumanContextChange,
  onRescore,
  onAccept,
}: HitlFormProps) {
  return (
    <div className="p-4 border border-yellow-400 bg-yellow-50 rounded space-y-3">
      <p className="text-sm font-medium text-yellow-800">
        Score too low ({interruptedScore != null ? interruptedScore : "—"}/100). Add context
        about your experience that your resume does not show:
      </p>
      <form onSubmit={onRescore} className="space-y-2">
        <textarea
          value={humanContext}
          onChange={(e) => onHumanContextChange(e.target.value)}
          rows={3}
          className="block w-full border border-yellow-300 rounded p-2 text-sm"
          placeholder="e.g. I led a team of 5 engineers for 2 years but it was off the books…"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!humanContext.trim()}
            className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-40 text-sm font-medium"
          >
            Re-score
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="px-4 py-2 bg-white border border-yellow-400 text-yellow-800 rounded hover:bg-yellow-100 text-sm font-medium"
          >
            Accept score
          </button>
        </div>
      </form>
    </div>
  );
}
