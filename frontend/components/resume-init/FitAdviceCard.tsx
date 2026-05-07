"use client";

import { useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FitAdviceCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function FitAdviceCard({ icon, title, subtitle, defaultOpen, children }: FitAdviceCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);

  return (
    <div className="bg-card border border-border rounded-[12px] flex flex-col w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex flex-row items-center gap-3 px-5 py-[14px] w-full text-left",
          isOpen && "border-b border-border/50",
        )}
      >
        <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center shrink-0 text-primary-foreground">
          {icon}
        </div>
        <div className="flex flex-col gap-0.5 flex-1">
          <span className="font-medium text-[14px] text-foreground leading-5">{title}</span>
          <span className="font-normal text-[12px] text-muted-foreground leading-5">{subtitle}</span>
        </div>
        <ChevronUp
          size={16}
          className={cn("text-muted-foreground shrink-0 transition-transform", !isOpen && "rotate-180")}
        />
      </button>
      {isOpen && children}
    </div>
  );
}
