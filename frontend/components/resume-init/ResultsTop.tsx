"use client";

import { Stepper } from "@/components/resume-init/Stepper";
import { BattleCard } from "@/components/resume-init/BattleCard";

interface ResultsTopProps {
  nodes: {
    id: string;
    label: string;
    status: "idle" | "active" | "done";
    durationMs?: number;
  }[];
}

export function ResultsTop({ nodes }: ResultsTopProps) {
  return (
    <div
      className="flex flex-row justify-center items-center gap-[72px] mx-auto"
      style={{ width: "940px", height: "314px" }}
    >
      <Stepper nodes={nodes} />
      <BattleCard isLoading={true} />
    </div>
  );
}
