"use client";

import { Stepper } from "@/components/resume-init/Stepper";
import type { StepperNode } from "@/components/resume-init/Stepper";
import { BattleCard } from "@/components/resume-init/BattleCard";

interface ResultsTopProps {
  nodes: StepperNode[];
  isLoading: boolean;
  score?: number;
  headline?: string;
  bulletPoints?: string[];
}

export function ResultsTop({ nodes, isLoading, score, headline, bulletPoints }: ResultsTopProps) {
  return (
    <div
      className="flex flex-row justify-center items-center gap-[72px] mx-auto"
      style={{ width: "940px", minHeight: "314px" }}
    >
      <Stepper nodes={nodes} />
      <BattleCard isLoading={isLoading} score={score} headline={headline} paragraphs={bulletPoints} />
    </div>
  );
}
