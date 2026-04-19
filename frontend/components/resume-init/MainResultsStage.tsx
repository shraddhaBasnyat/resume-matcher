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
          <>
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
          </>
        )}
        {activeTab !== "resume-init" && (
          <p className="text-sm text-muted-foreground">Coming soon</p>
        )}
      </div>
    </div>
  );
}
