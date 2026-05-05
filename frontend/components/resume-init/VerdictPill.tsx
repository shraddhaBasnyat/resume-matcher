"use client";

import { cn } from "@/lib/utils";

type Verdict = "hard_gap" | "framing_gap" | "terminology_gap" | "strong_match";

const VERDICT_CONFIG: Record<Verdict, { label: string; bg: string; text: string }> = {
  hard_gap:        { label: "Hard gap",        bg: "bg-destructive-bg", text: "text-destructive" },
  framing_gap:     { label: "Framing gap",     bg: "bg-warning-bg",     text: "text-warning"     },
  terminology_gap: { label: "Terminology gap", bg: "bg-warning-bg",     text: "text-warning"     },
  strong_match:    { label: "Strong match",    bg: "bg-success-bg",     text: "text-success"     },
};

interface VerdictPillProps {
  verdict: Verdict;
}

export function VerdictPill({ verdict }: VerdictPillProps) {
  const config = VERDICT_CONFIG[verdict];
  return (
    <span className={cn(config.bg, config.text, "px-2 py-0.5 rounded-[20px] text-[11px] leading-5 font-normal shrink-0")}>
      {config.label}
    </span>
  );
}
