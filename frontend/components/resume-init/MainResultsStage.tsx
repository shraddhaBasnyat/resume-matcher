"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CoachesNotes } from "@/components/resume-init/CoachesNotes";
import { BattleCard } from "@/components/resume-init/BattleCard";
import { FitAdviceCard } from "@/components/resume-init/FitAdviceCard";
import { EvidenceListBody } from "@/components/resume-init/EvidenceListBody";
import { BeforeAfterBody } from "@/components/resume-init/BeforeAfterBody";
import { TaggedListBody } from "@/components/resume-init/TaggedListBody";
import { ScenarioSummary } from "@/components/resume-init/ScenarioSummary";
import { CompanyInitResult } from "@/components/company-init/CompanyInitResult";
import { ArcInitResult } from "@/components/arc-init/ArcInitResult";
import { type AppState, type NodeProgress } from "@/lib/match-constants";
import type { MatchResponse, FitAdviceEntry } from "@/lib/types/api";
import {
  ArrowRight, List, Clock, CheckSquare, Eye, HelpCircle,
  Star, AlertCircle, FileText, FileSearch,
} from "lucide-react";

type TabId = "resume-init" | "company-init" | "arc-init";

const TABS = [
  { id: "resume-init" as const, label: "ResumeInit" },
  { id: "company-init" as const, label: "CompanyInit" },
  { id: "arc-init" as const, label: "ArcInit" },
];

const FIT_ADVICE_CONFIG: Record<FitAdviceEntry["key"], { title: string; subtitle: string; icon: React.ReactNode }> = {
  transferable_strengths: { title: "What experience transfers directly?",       subtitle: "transferable strengths", icon: <ArrowRight size={16} /> },
  reframing_suggestions:  { title: "How should you retell your story?",         subtitle: "reframing suggestions",  icon: <List size={16} />       },
  missing_skills:         { title: "What gaps are genuinely there?",            subtitle: "gaps identified",        icon: <Clock size={16} />      },
  lead_with_these:        { title: "What should you lead with?",                subtitle: "interview strengths",    icon: <Star size={16} />       },
  expect_these_questions: { title: "What questions should you prepare for?",    subtitle: "likely questions",       icon: <HelpCircle size={16} /> },
  watch_out_for:          { title: "Where might the interviewer probe harder?", subtitle: "risk areas",             icon: <Eye size={16} />        },
  standout_strengths:     { title: "What makes you stand out?",                subtitle: "standout strengths",     icon: <Star size={16} />       },
  ats_reality_check:      { title: "Why is ATS filtering you out?",            subtitle: "ATS issues",             icon: <AlertCircle size={16} />},
  terminology_swaps:      { title: "What terminology should you swap?",        subtitle: "terminology fixes",      icon: <List size={16} />       },
  keywords_to_add:        { title: "What keywords are you missing?",           subtitle: "keywords to add",        icon: <CheckSquare size={16} />},
  honest_assessment:      { title: "What is the honest assessment?",           subtitle: "gap analysis",           icon: <FileText size={16} />   },
  closing_steps:          { title: "What are your next steps?",                subtitle: "action items",           icon: <CheckSquare size={16} />},
  acknowledgement:        { title: "What did we consider?",                    subtitle: "context considered",     icon: <Eye size={16} />        },
};

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
    beat1: deriveBeatStatus(progress["atsGapAnalysis"]?.aha !== undefined, progress["atsGapAnalysis"]?.status),
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
          {appState === "idle" && result === null && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-24">
              <FileSearch size={32} className="text-muted-foreground/40" />
              <p className="font-brand text-sm text-muted-foreground/60">
                Run your first analysis to see results
              </p>
            </div>
          )}
          {(appState === "running" || result !== null) && (
            <CoachesNotes
              isLoading={appState === "running"}
              atsSignal={progress["atsGapAnalysis"]?.aha}
              fitSignal={progress["analyzeFit"]?.aha}
              fitScore={progress["analyzeFit"]?.fitScore}
              atsScore={progress["atsGapAnalysis"]?.atsScore}
              scenarioId={progress["routeVerdicts"]?.scenarioId}
              nextStep={progress["analyzeMatch"]?.aha}
              beatStatuses={beatStatuses}
            />
          )}
          {result !== null && (
            <>
              <BattleCard
                fitScore={result.fitScore}
                atsScore={result.atsProfile.atsScore ?? undefined}
                scenarioId={result.scenarioId}
                scenario={result.scenarioId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                headline={result.battleCard.headline}
                bullets={result.battleCard.bullets}
              />
              {result.fitAdvice.map((entry, index) => {
                const config = FIT_ADVICE_CONFIG[entry.key];
                if (!config) return null;

                let body: React.ReactNode;
                switch (entry.key) {
                  case "reframing_suggestions":
                  case "terminology_swaps":
                    body = <BeforeAfterBody items={entry.items} />;
                    break;
                  case "missing_skills":
                  case "keywords_to_add":
                  case "closing_steps":
                    body = <TaggedListBody items={entry.items} />;
                    break;
                  default:
                    body = <EvidenceListBody items={entry.items} />;
                }

                return (
                  <FitAdviceCard
                    key={entry.key}
                    icon={config.icon}
                    title={config.title}
                    subtitle={`${entry.items.length} ${config.subtitle}`}
                    defaultOpen={index === 0}
                  >
                    {body}
                  </FitAdviceCard>
                );
              })}
              <ScenarioSummary
                scenario={result.scenarioId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                scenarioId={result.scenarioId}
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
