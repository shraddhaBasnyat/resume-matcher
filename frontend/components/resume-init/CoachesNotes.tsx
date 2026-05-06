"use client";

import { Check, LoaderCircle } from "lucide-react";

type BeatStatus = "idle" | "running" | "done";

interface CoachesNotesProps {
  isLoading: boolean;
  atsSignal?: string;
  fitSignal?: string;
  fitScore?: number;
  atsScore?: number;
  scenarioId?: string;
  nextStep?: string;
  beatStatuses?: {
    beat1: BeatStatus;
    beat2: BeatStatus;
    beat3: BeatStatus;
    beat4: BeatStatus;
  };
}


interface BeatProps {
  status: BeatStatus;
  isLast?: boolean;
  badge: string;
  children: React.ReactNode;
}

function Beat({ status, isLast, badge, children }: BeatProps) {
  return (
    <div className="flex flex-row gap-3 items-start">
      <div className="w-6 flex flex-col items-center">
        {status === "done" && (
          <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center flex-shrink-0">
            <Check size={16} className="text-white" />
          </div>
        )}
        {status === "running" && (
          <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center flex-shrink-0">
            <LoaderCircle size={16} className="text-primary-foreground animate-spin" />
          </div>
        )}
        {status === "idle" && (
          <div className="w-6 h-6 bg-muted border border-border rounded-full flex-shrink-0" />
        )}
        {!isLast && (
          <div className={`w-0.5 h-[80px] ${status === "done" ? "bg-success" : "bg-muted"}`} />
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1">
        <span className="bg-secondary text-primary font-brand text-[10px] leading-5 px-2 py-0.5 rounded-[4px] self-start">
          {badge}
        </span>
        {status === "done" && children}
      </div>
    </div>
  );
}

export function CoachesNotes({
  atsSignal,
  fitSignal,
  fitScore,
  atsScore,
  scenarioId,
  nextStep,
  beatStatuses,
}: CoachesNotesProps) {
  const scenarioLabel = scenarioId
    ? scenarioId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : undefined;

  const s1 = beatStatuses?.beat1 ?? (atsSignal !== undefined ? "done" : "idle");
  const s2 = beatStatuses?.beat2 ?? (fitSignal !== undefined ? "done" : "idle");
  const s3 = beatStatuses?.beat3 ?? (fitScore !== undefined ? "done" : "idle");
  const s4 = beatStatuses?.beat4 ?? (nextStep !== undefined ? "done" : "idle");

  return (
    <div className="flex flex-col w-full items-start p-6">
      <span className="text-[10px] leading-5 font-bold tracking-[0.08em] text-muted-foreground uppercase mb-4">
        COACH&apos;S NOTES
      </span>

      <Beat status={s1} badge="ATS SIGNAL">
        <p className="text-sm text-foreground font-normal">{atsSignal}</p>
      </Beat>

      <Beat status={s2} badge="FIT SIGNAL">
        <p className="text-sm text-foreground font-normal">{fitSignal}</p>
      </Beat>

      <Beat status={s3} badge="VERDICT">
        <div className="flex flex-row items-center gap-2">
          <span className="font-brand text-sm text-muted-foreground">
            fit {fitScore} · ATS {atsScore}
          </span>
          {scenarioLabel && (
            <span className="bg-primary text-primary-foreground font-brand text-sm px-[10px] py-[3px] rounded-[6px]">
              {scenarioLabel}
            </span>
          )}
        </div>
      </Beat>

      <Beat status={s4} isLast badge="NEXT STEP">
        <p className="text-sm text-foreground font-normal">{nextStep}</p>
      </Beat>
    </div>
  );
}
