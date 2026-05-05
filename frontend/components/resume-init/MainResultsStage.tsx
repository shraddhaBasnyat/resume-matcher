"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachesNotes } from "@/components/resume-init/CoachesNotes";
import { BattleCard } from "@/components/resume-init/BattleCard";
import { FitAdviceAccordion } from "@/components/resume-init/FitAdviceAccordion";
import { ScenarioSummary } from "@/components/resume-init/ScenarioSummary";
import { CompanyInitResult } from "@/components/company-init/CompanyInitResult";
import { ArcInitResult } from "@/components/arc-init/ArcInitResult";
import { type AppState, type NodeProgress } from "@/lib/match-constants";
import type { MatchResponse } from "@/lib/types/api";

type TabId = "resume-init" | "company-init" | "arc-init";

const TABS = [
  { id: "resume-init" as const, label: "ResumeInit" },
  { id: "company-init" as const, label: "CompanyInit" },
  { id: "arc-init" as const, label: "ArcInit" },
];

interface MainResultsStageProps {
  className?: string;
  result: MatchResponse | null;
  progress: Record<string, NodeProgress>;
  appState: AppState;
}

function deriveBeatStatus(
  isDone: boolean,
  progressStatus: string | undefined
): "idle" | "running" | "done" {
  if (isDone) return "done";
  if (progressStatus === "running") return "running";
  return "idle";
}

export function MainResultsStage({ className, result, progress, appState }: MainResultsStageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("resume-init");

  const beatStatuses = {
    beat1: deriveBeatStatus(progress["atsAnalysis"]?.aha !== undefined, progress["atsAnalysis"]?.status),
    beat2: deriveBeatStatus(progress["analyzeFit"]?.aha !== undefined, progress["analyzeFit"]?.status),
    beat3: deriveBeatStatus(progress["routeVerdicts"]?.fitScore !== undefined, progress["routeVerdicts"]?.status),
    beat4: deriveBeatStatus(progress["analyzeMatch"]?.aha !== undefined, progress["analyzeMatch"]?.status),
  };

  return (
    <div className={cn("bg-background border border-border/50 shadow-card flex flex-col min-h-[600px]", className)}>
      <div className="h-[66px] w-full flex flex-row items-center px-4 border-b border-border/50">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
          <TabsList className="bg-muted rounded-[6px] p-[5px] flex flex-row gap-1">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="font-brand font-medium text-xs px-3 py-1 rounded-[4px] transition-colors text-muted-foreground data-[active]:bg-card data-[active]:shadow-sm data-[active]:text-foreground"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "resume-init" && (appState === "running" || result !== null) && (
        <div className="p-6 flex flex-col gap-6">
          <CoachesNotes
            isLoading={appState === "running"}
            atsSignal={progress["atsAnalysis"]?.aha}
            fitSignal={progress["analyzeFit"]?.aha}
            fitScore={progress["routeVerdicts"]?.fitScore}
            atsScore={progress["routeVerdicts"]?.atsScore}
            scenarioId={progress["routeVerdicts"]?.scenarioId}
            nextStep={progress["analyzeMatch"]?.aha}
            beatStatuses={beatStatuses}
          />
          <BattleCard
            isLoading={appState === "running"}
            score={result?.fitScore}
            headline={result?.battleCard.headline}
            paragraphs={result?.battleCard.bulletPoints}
          />
          {result !== null && (
            <>
              <FitAdviceAccordion isLoading={false} items={result.fitAdvice} />
              <ScenarioSummary
                scenario={result.scenarioId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                text={result.scenarioSummary.text}
              />
            </>
          )}
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
