"use client";

import { useState } from "react";
import { ResultsHeader, type TabId } from "@/components/resume-init/ResultsHeader";

export function MainResultsStage() {
  const [activeTab, setActiveTab] = useState<TabId>("resume-init");

  return (
    <div className="bg-card border border-border/50 shadow-card">
      <ResultsHeader activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="p-6">
        {activeTab === "resume-init" && (
          <div />
          /* Stepper / ScoreCard / Accordions coming */
        )}
        {activeTab !== "resume-init" && (
          <p className="text-sm text-muted-foreground">Coming soon</p>
        )}
      </div>
    </div>
  );
}
