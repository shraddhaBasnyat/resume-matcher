import { AppState, NodeProgress } from "@/lib/match-constants";

interface MatchProgressProps {
  appState: AppState;
  progress: Record<string, NodeProgress>;
  steps: { key: string; label: string }[];
}

export function MatchProgress({ appState, progress, steps }: MatchProgressProps) {
  if (appState !== "running" && appState !== "interrupted" && appState !== "completed") {
    return null;
  }

  return (
    <div className="space-y-2">
      {steps.map(({ key, label }) => {
        const step = progress[key];
        return (
          <div key={key} className="flex items-center gap-3 text-sm">
            {step.status === "waiting" && (
              <span className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />
            )}
            {step.status === "running" && (
              <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
            )}
            {step.status === "done" && (
              <span className="w-4 h-4 rounded-full bg-green-500 shrink-0 flex items-center justify-center text-white text-[10px]">
                ✓
              </span>
            )}
            <span
              className={
                step.status === "waiting"
                  ? "text-gray-400"
                  : step.status === "running"
                  ? "text-blue-700 font-medium"
                  : "text-green-700"
              }
            >
              {label}
            </span>
            {step.status === "done" && step.durationMs != null && (
              <span className="text-gray-400 text-xs">
                {(step.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
