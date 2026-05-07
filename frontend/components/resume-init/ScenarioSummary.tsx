"use client";

import { FileText } from "lucide-react";

interface ScenarioSummaryProps {
  scenario: string;
  scenarioId: string;
  text: string;
}

export function ScenarioSummary({ scenario, scenarioId: _scenarioId, text }: ScenarioSummaryProps) {
  const paragraphs = text.split("\n\n").filter(Boolean);

  return (
    <div className="bg-card border border-border rounded-[12px] flex flex-col w-full">
      <div className="flex flex-row items-center gap-3 px-5 py-[14px] border-b border-border/50">
        <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shrink-0">
          <FileText size={16} className="text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="font-medium text-[14px] text-foreground leading-5">Scenario summary</span>
          <span className="font-normal text-[12px] text-muted-foreground leading-5">
            {scenario} · closing assessment
          </span>
        </div>
      </div>
      <div className="px-5 py-5 flex flex-col gap-5">
        {paragraphs.map((para, i) =>
          i === paragraphs.length - 1 ? (
            <p key={i} className="font-semibold text-[14px] text-foreground leading-5">{para}</p>
          ) : (
            <p key={i} className="font-normal text-[14px] text-foreground leading-5">{para}</p>
          )
        )}
      </div>
    </div>
  );
}
