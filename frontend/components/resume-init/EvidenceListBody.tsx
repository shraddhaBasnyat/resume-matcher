import type { EvidenceItem } from "@/lib/types/api";

interface EvidenceListBodyProps {
  items: EvidenceItem[];
}

export function EvidenceListBody({ items }: EvidenceListBodyProps) {
  return (
    <div className="flex flex-col w-full">
      {items.map((item, i) => (
        <div key={i} className="px-5 py-3 flex flex-col gap-1 border-b border-border/50 last:border-b-0">
          <span className="font-medium text-[14px] text-foreground leading-5">{item.label}</span>
          <span className="font-normal text-[13px] text-muted-foreground leading-5">{item.detail}</span>
          {item.confidence === "high" ? (
            <span className="self-start font-brand text-[10px] leading-5 px-2 py-0.5 rounded-full bg-success-bg text-success">
              high confidence
            </span>
          ) : (
            <span className="self-start font-brand text-[10px] leading-5 px-2 py-0.5 rounded-full bg-warning-bg text-warning">
              medium confidence
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
