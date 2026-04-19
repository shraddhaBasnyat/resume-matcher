"use client";

import { Progress } from "@base-ui/react/progress";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  return (
    <Progress.Root value={value}>
      <Progress.Track
        className={cn(
          "bg-secondary h-2 rounded-full w-full overflow-hidden",
          className
        )}
      >
        <Progress.Indicator
          className="bg-primary h-full rounded-full transition-all"
          style={{ width: `${value}%` }}
        />
      </Progress.Track>
    </Progress.Root>
  );
}
