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
    // routeVerdicts returns a Command — LangGraph doesn't expose Command.update through
    // _outputs, so fitScore/atsScore/scenarioId never arrive in its node_done payload.
    // isDone = the node itself completed; data props are read from the nodes that own them.
    beat3: deriveBeatStatus(progress["routeVerdicts"]?.status === "done", progress["routeVerdicts"]?.status),
    beat4: deriveBeatStatus(progress["analyzeMatch"]?.aha !== undefined, progress["analyzeMatch"]?.status),
  };

  return (
    <div className={cn("flex flex-col min-h-[600px]", className)}>
      <div className="w-fit border-t border-l border-r border-border rounded-t-[6px]">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
        <TabsList className="bg-muted rounded-t-[6px] rounded-b-none pt-[5px] pb-0 px-1 flex flex-row gap-1 w-fit">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="font-brand font-medium text-xs px-3 py-1 rounded-[4px] transition-colors text-muted-foreground data-[active]:bg-background data-[active]:shadow-sm data-[active]:text-foreground data-[active]:pb-[9px] data-[active]:rounded-b-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      </div>

      {activeTab === "resume-init" && (
        <div className="bg-background w-full flex flex-col px-6 py-4 gap-3 items-center min-h-[600px]">
          {(appState === "running" || result !== null) && (
            <>
              <CoachesNotes
                isLoading={appState === "running"}
                atsSignal={progress["atsAnalysis"]?.aha}
                fitSignal={progress["analyzeFit"]?.aha}
                fitScore={progress["analyzeFit"]?.fitScore}
                atsScore={progress["atsAnalysis"]?.atsScore}
                scenarioId={progress["routeVerdicts"]?.scenarioId}
                nextStep={progress["analyzeMatch"]?.aha}
                beatStatuses={beatStatuses}
              />
              <BattleCard
                isLoading={appState === "running"}
                score={result?.fitScore}
                headline={result?.battleCard.headline}
                // @ts-expect-error — bulletPoints removed in feat/battle-card-schema; resolved in feat/battle-card-v2
                paragraphs={result?.battleCard.bulletPoints}
              />
            </>
          )}
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
