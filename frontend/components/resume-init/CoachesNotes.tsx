"use client";

import { Check } from "lucide-react";

interface CoachesNotesProps {
  isLoading: boolean;
  atsSignal?: string;
  fitSignal?: string;
  fitScore?: number;
  atsScore?: number;
  scenarioId?: string;
  nextStep?: string;
}

function BeatSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="w-[200px] h-3 bg-muted rounded" />
      <div className="w-[140px] h-3 bg-muted rounded" />
    </div>
  );
}

interface BeatProps {
  isDone: boolean;
  isLast?: boolean;
  badge: string;
  children: React.ReactNode;
}

function Beat({ isDone, isLast, badge, children }: BeatProps) {
  return (
    <div className="flex flex-row gap-3 items-start">
      <div className="w-6 flex flex-col items-center">
        {isDone ? (
          <div className="w-6 h-6 bg-success rounded-full flex items-center justify-center flex-shrink-0">
            <Check size={16} className="text-white" />
          </div>
        ) : (
          <div className="w-6 h-6 bg-muted border border-border rounded-full flex-shrink-0" />
        )}
        {!isLast && (
          <div className={`w-0.5 h-[80px] ${isDone ? "bg-success" : "bg-muted"}`} />
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1">
        {isDone ? (
          <>
            <span className="bg-secondary text-primary font-brand text-[10px] leading-5 px-2 py-0.5 rounded-[4px] self-start">
              {badge}
            </span>
            {children}
          </>
        ) : (
          <BeatSkeleton />
        )}
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
}: CoachesNotesProps) {
  const scenarioLabel = scenarioId
    ? scenarioId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : undefined;

  return (
    <div className="flex flex-col w-full items-start">
      <span className="text-[10px] leading-5 font-bold tracking-[0.08em] text-muted-foreground uppercase mb-4">
        COACH&apos;S NOTES
      </span>

      <Beat isDone={atsSignal !== undefined} badge="ATS SIGNAL">
        <p className="text-sm text-foreground font-normal">{atsSignal}</p>
      </Beat>

      <Beat isDone={fitSignal !== undefined} badge="FIT SIGNAL">
        <p className="text-sm text-foreground font-normal">{fitSignal}</p>
      </Beat>

      <Beat isDone={fitScore !== undefined} badge="VERDICT">
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

      <Beat isDone={nextStep !== undefined} isLast badge="NEXT STEP">
        <p className="text-sm text-foreground font-normal">{nextStep}</p>
      </Beat>
    </div>
  );
}
