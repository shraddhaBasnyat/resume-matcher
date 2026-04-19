"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ResultsHeader, type TabId } from "@/components/resume-init/ResultsHeader";
import { ResultsTop } from "@/components/resume-init/ResultsTop";
import { FitAdviceAccordion } from "@/components/resume-init/FitAdviceAccordion";
import { ScenarioSummary } from "@/components/resume-init/ScenarioSummary";
import {
  DUMMY_NODES,
  DUMMY_BATTLE_CARD,
  DUMMY_FIT_ADVICE,
  DUMMY_NARRATIVE_BRIDGE,
} from "@/components/resume-init/dummy-data";
import { CompanyInitResult } from "@/components/company-init/CompanyInitResult";
import { ArcInitResult } from "@/components/arc-init/ArcInitResult";

interface MainResultsStageProps {
  className?: string;
}

export function MainResultsStage({ className }: MainResultsStageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("resume-init");

  return (
    <div className={cn("bg-background border border-border/50 shadow-card flex flex-col min-h-[600px]", className)}>
      <ResultsHeader activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "resume-init" && (
        <div className="p-6">
          <ResultsTop
            nodes={DUMMY_NODES}
            isLoading={false}
            score={DUMMY_BATTLE_CARD.score}
            headline={DUMMY_BATTLE_CARD.headline}
            bulletPoints={DUMMY_BATTLE_CARD.bulletPoints}
          />
          <div className="mt-6">
            <FitAdviceAccordion isLoading={false} items={DUMMY_FIT_ADVICE} />
          </div>
          <ScenarioSummary
            scenario={DUMMY_NARRATIVE_BRIDGE.scenario}
            text={DUMMY_NARRATIVE_BRIDGE.text}
          />
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
