"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResultsHeader, type TabId } from "@/components/resume-init/ResultsHeader";
import { ResultsTop } from "@/components/resume-init/ResultsTop";

// TODO: replace with useMatchRunner SSE state
const TEST_NODES = [
  { id: "parse-resume", label: "Parsing Resume", status: "done" as const, durationMs: 9100 },
  { id: "parse-job",    label: "Parsing Job",    status: "active" as const },
  { id: "score-match",  label: "Scoring Match",  status: "idle" as const },
  { id: "analyze-gap",  label: "Analyzing Gap",  status: "idle" as const },
];

interface MainResultsStageProps {
  className?: string;
}

export function MainResultsStage({ className }: MainResultsStageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("resume-init");

  return (
    <div className={cn("bg-background border border-border/50 shadow-card", className)}>
      <ResultsHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="p-6">
        {activeTab === "resume-init" && (
          <ResultsTop nodes={TEST_NODES} />
        )}
        {activeTab !== "resume-init" && (
          <p className="text-sm text-muted-foreground">Coming soon</p>
        )}
      </div>
    </div>
  );
}
