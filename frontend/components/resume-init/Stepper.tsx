"use client";

import { CircleCheck, LoaderCircle } from "lucide-react";

interface StepperNode {
  id: string;
  label: string;
  status: "idle" | "active" | "done";
  durationMs?: number;
}

interface StepperProps {
  nodes: StepperNode[];
}

export function Stepper({ nodes }: StepperProps) {
  return (
    <div className="flex flex-col w-[218px] border-r border-success pt-6 pb-6 pl-6 pr-4">
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        return (
          <div key={node.id} className="flex flex-row gap-3 w-full">
            {/* Indicator column */}
            <div className="w-6 flex flex-col items-center">
              {node.status === "done" && (
                <>
                  <CircleCheck size={24} className="text-success" />
                  {!isLast && <div className="w-0.5 h-[50px] bg-success" />}
                </>
              )}
              {node.status === "active" && (
                <>
                  <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                    <LoaderCircle size={16} className="text-primary-foreground" />
                  </div>
                  {!isLast && <div className="w-0.5 h-[50px] bg-muted" />}
                </>
              )}
              {node.status === "idle" && (
                <>
                  <div className="w-6 h-6 bg-muted border border-border rounded-full" />
                  {!isLast && <div className="w-0.5 h-[50px] bg-muted" />}
                </>
              )}
            </div>

            {/* Content column */}
            <div className="flex flex-col gap-1">
              {node.status === "done" && (
                <>
                  <span className="font-medium text-sm text-success">{node.label}</span>
                  <span className="font-normal text-xs text-success">
                    {((node.durationMs ?? 0) / 1000).toFixed(1)}s
                  </span>
                </>
              )}
              {node.status === "active" && (
                <span className="font-bold text-sm text-primary">{node.label}</span>
              )}
              {node.status === "idle" && (
                <span className="font-medium text-sm text-success">{node.label}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
