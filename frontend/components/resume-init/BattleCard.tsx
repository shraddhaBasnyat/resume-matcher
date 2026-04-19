"use client";

interface BattleCardProps {
  isLoading: boolean;
  score?: number;
  headline?: string;
  paragraphs?: string[];
}

const SKELETON_GROUPS = [0, 1, 2];

export function BattleCard({ isLoading, score, headline, paragraphs }: BattleCardProps) {
  return (
    <div
      className="flex flex-row items-center py-8 px-6 gap-4 bg-muted border border-border rounded-[24px]"
      style={{ width: "650px", height: "314px", boxShadow: "0px 4px 4px rgba(229, 229, 202, 0.5)" }}
    >
      {isLoading ? (
        <>
          {/* Skeleton metric circle */}
          <div className="w-[100px] h-[100px] rounded-full bg-muted-foreground/10 shrink-0" />

          {/* Skeleton strategy column */}
          <div className="flex flex-col py-4 gap-6">
            <div className="w-[200px] h-[18px] bg-primary/40 rounded-[6px]" />
            <div className="flex flex-col gap-4">
              {SKELETON_GROUPS.map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <div className="w-[350px] h-[18px] bg-muted-foreground/10 rounded-[6px]" />
                  <div className="w-[250px] h-[18px] bg-muted-foreground/10 rounded-[6px]" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Score circle */}
          <div className="w-[100px] h-[100px] rounded-full bg-primary flex items-center justify-center shrink-0 overflow-hidden">
            <span className="font-semibold text-5xl text-primary-foreground leading-none">{score}</span>
          </div>

          {/* Strategy column */}
          <div className="flex flex-col py-4 gap-6">
            <span className="font-semibold text-sm text-foreground">{headline}</span>
            <div className="flex flex-col gap-4">
              {paragraphs?.map((p, i) => (
                <p key={i} className="font-normal text-sm text-muted-foreground">{p}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
