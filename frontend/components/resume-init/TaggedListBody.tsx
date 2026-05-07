import type { TaggedItem } from "@/lib/types/api";

interface TaggedListBodyProps {
  items: TaggedItem[];
}

export function TaggedListBody({ items }: TaggedListBodyProps) {
  return (
    <div className="flex flex-col w-full">
      {items.map((item, i) => (
        <div key={i} className="px-5 py-3 flex flex-row gap-[10px] items-start border-b border-border/50 last:border-b-0">
          {item.severity === "material" ? (
            <span className="shrink-0 font-brand text-[10px] leading-5 px-2 py-0.5 rounded-full bg-destructive-bg text-destructive">
              material
            </span>
          ) : (
            <span className="shrink-0 font-brand text-[10px] leading-5 px-2 py-0.5 rounded-full bg-warning-bg text-warning">
              notable
            </span>
          )}
          <span className="font-normal text-[13px] text-foreground leading-5 flex-1">{item.text}</span>
        </div>
      ))}
    </div>
  );
}
