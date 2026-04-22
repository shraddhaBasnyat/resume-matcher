"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResultsHeader, type TabId } from "@/components/resume-init/ResultsHeader";
import { ResultsTop } from "@/components/resume-init/ResultsTop";
import { FitAdviceAccordion } from "@/components/resume-init/FitAdviceAccordion";
import { ScenarioSummary } from "@/components/resume-init/ScenarioSummary";
import { CompanyInitResult } from "@/components/company-init/CompanyInitResult";
import { ArcInitResult } from "@/components/arc-init/ArcInitResult";
import { STEPS, type AppState, type NodeProgress } from "@/lib/match-constants";
import type { MatchResponse } from "@/lib/types/api";
import type { StepperNode } from "@/components/resume-init/Stepper";

interface MainResultsStageProps {
  className?: string;
  result: MatchResponse | null;
  progress: Record<string, NodeProgress>;
  appState: AppState;
}

export function MainResultsStage({ className, result, progress, appState }: MainResultsStageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("resume-init");

  const nodes: StepperNode[] = STEPS.map(({ key, label }) => {
    const p = progress[key];
    return {
      id: key,
      label,
      status: p?.status === "running" ? "active" : p?.status === "done" ? "done" : "idle",
      durationMs: p?.durationMs,
    };
  });

  return (
    <div className={cn("bg-background border border-border/50 shadow-card flex flex-col min-h-[600px]", className)}>
      <ResultsHeader activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "resume-init" && result !== null && (
        <div className="p-6">
          <ResultsTop
            nodes={nodes}
            isLoading={false}
            score={result.fitScore}
            headline={result.battleCard.headline}
            bulletPoints={result.battleCard.bulletPoints}
          />
          <div className="mt-6">
            <FitAdviceAccordion isLoading={false} items={result.fitAdvice} />
          </div>
          <ScenarioSummary
            scenario={result.scenarioId.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
            text={result.scenarioSummary.text}
          />
        </div>
      )}
      {activeTab === "resume-init" && result === null && appState === "running" && (
        <div className="p-6">
          <ResultsTop nodes={nodes} isLoading={true} />
          <div className="mt-6">
            <FitAdviceAccordion isLoading={true} />
          </div>
        </div>
      )}
      {activeTab === "company-init" && (
        <div className="flex flex-col flex-1">
          <CompanyInitResult />
        </div>
      )}
      {activeTab === "arc-init" && (
        <div className="flex flex-col flex-1">
          <ArcInitResult />
        </div>
      )}
    </div>
  );
}
