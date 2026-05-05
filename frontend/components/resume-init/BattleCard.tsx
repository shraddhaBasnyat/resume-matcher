"use client";

import { cn } from "@/lib/utils";
import { VerdictPill } from "@/components/resume-init/VerdictPill";
import type { ScenarioId, BattleCardBullet } from "@/lib/types/api";

const SCENARIO_BADGE_CONFIG: Record<ScenarioId, { bg: string; text: string }> = {
  confirmed_fit:    { bg: "bg-success-bg",    text: "text-success"     },
  invisible_expert: { bg: "bg-secondary",      text: "text-primary"     },
  narrative_gap:    { bg: "bg-warning-bg",     text: "text-warning"     },
  honest_verdict:   { bg: "bg-destructive-bg", text: "text-destructive" },
};

interface BattleCardProps {
  fitScore?: number;
  atsScore?: number;
  scenarioId?: ScenarioId;
  scenario?: string;
  headline?: string;
  bullets?: BattleCardBullet[];
}

export function BattleCard({ fitScore, atsScore, scenarioId, scenario, headline, bullets }: BattleCardProps) {
  const badgeConfig = scenarioId ? SCENARIO_BADGE_CONFIG[scenarioId] : null;

  return (
    <div className="bg-card border border-border rounded-[12px] flex flex-col w-full gap-4 p-6">
      {/* Top row */}
      <div className="flex flex-row gap-4 items-start border-b border-border/50 pb-3">
        {/* Score circle */}
        <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center shrink-0">
          <span className="font-bold text-2xl text-primary-foreground">{fitScore}</span>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-2 flex-1">
          {badgeConfig && scenario && (
            <span className={cn(badgeConfig.bg, badgeConfig.text, "font-bold text-[10px] leading-5 px-3 py-1 rounded-full self-start")}>
              {scenario}
            </span>
          )}
          {headline && (
            <span className="text-[15px] text-foreground font-normal leading-5">{headline}</span>
          )}
          <div className="flex flex-row gap-6 font-brand text-[11px] leading-5">
            <span className="text-foreground">Fit {fitScore}</span>
            <span className="text-destructive">ATS {atsScore ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Bullet rows */}
      {bullets && bullets.length > 0 && (
        <div className="flex flex-col">
          {bullets.map((bullet, i) => (
            <div key={i} className="flex flex-col gap-1 py-3 border-b border-border/50 last:border-b-0">
              <span className="font-brand font-bold text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
                {bullet.requirement}
              </span>
              <div className="flex flex-row gap-3 items-start">
                <span className="text-[13px] text-foreground font-normal flex-1">{bullet.evidence}</span>
                <VerdictPill verdict={bullet.verdict} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
