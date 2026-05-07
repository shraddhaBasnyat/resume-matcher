import type { ReframingItem } from "@/lib/types/api";

interface BeforeAfterBodyProps {
  items: ReframingItem[];
}

export function BeforeAfterBody({ items }: BeforeAfterBodyProps) {
  return (
    <div className="flex flex-col w-full">
      {items.map((item, i) => (
        <div key={i} className="px-5 py-4 flex flex-col gap-2 items-start border-b border-border/50 last:border-b-0">
          <p className="border-l-2 border-border px-[10px] font-normal text-[13px] text-muted-foreground leading-5 italic">
            {item.before}
          </p>
          <span className="font-brand text-[10px] leading-5 text-muted-foreground tracking-[0.05em]">
            ↓ REFRAME AS
          </span>
          <p className="border-l-2 border-primary px-[10px] font-medium text-[13px] text-foreground leading-5 tracking-[0.05em]">
            {item.after}
          </p>
          <p className="font-normal text-[12px] text-muted-foreground leading-5">{item.reason}</p>
        </div>
      ))}
    </div>
  );
}
