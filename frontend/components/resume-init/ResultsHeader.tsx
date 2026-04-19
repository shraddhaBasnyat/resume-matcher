"use client";

import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/progress";

export type TabId = "resume-init" | "company-init" | "arc-init";

const TABS = [
  {
    id: "resume-init"  as const,
    label: "ResumeInit",
    locked: false,
    progress: 33,
    progressLabel: "Technical Alignment: Get the Interview",
  },
  {
    id: "company-init" as const,
    label: "CompanyInit",
    locked: true,
    progress: 66,
    progressLabel: "Tactical Intelligence: Win the Offer",
  },
  {
    id: "arc-init" as const,
    label: "ArcInit",
    locked: true,
    progress: 100,
    progressLabel: "Strategic Roadmap: Own the Career Path",
  },
];

interface ResultsHeaderProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function ResultsHeader({ activeTab, onTabChange }: ResultsHeaderProps) {
  const activeTabConfig = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="h-[66px] w-full flex flex-row items-center justify-between px-4 border-b border-border/50">
      {/* Left — tab pill */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as TabId)}
      >
        <TabsList className="bg-muted rounded-[6px] p-[5px] flex flex-row gap-1">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className={cn(
                "font-brand font-medium text-xs px-3 py-1 rounded-[4px] transition-colors",
                "text-muted-foreground",
                "data-[active]:bg-card data-[active]:shadow-sm data-[active]:text-foreground",
              )}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Right — progress section */}
      <div className="w-[414px] flex flex-col gap-1.5">
        <span className="font-brand font-medium text-xs text-muted-foreground">
          {activeTabConfig.progressLabel}
        </span>
        <ProgressBar value={activeTabConfig.progress} />
      </div>
    </div>
  );
}
