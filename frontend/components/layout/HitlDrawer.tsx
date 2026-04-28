"use client";

import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";

interface HitlDrawerProps {
  open: boolean;
  contextPrompt: string | null;
  humanContext: string;
  setHumanContext: (v: string) => void;
  handleRescore: (e: React.FormEvent) => Promise<void>;
  handleAccept: () => Promise<void>;
}

const FALLBACK_DESCRIPTION =
  "The role requires context that wasn’t clear from your resume alone. Add any relevant experience or examples below so the analysis can be recalculated accurately.";

export function HitlDrawer({
  open,
  contextPrompt,
  humanContext,
  setHumanContext,
  handleRescore,
  handleAccept,
}: HitlDrawerProps) {
  const description = contextPrompt?.trim() || FALLBACK_DESCRIPTION;
  return (
    <>
      <DrawerBackdrop open={open} />
      <DrawerPanel open={open}>
        <div className="max-w-[640px] mx-auto px-6 py-6 flex flex-col gap-4">
          {/* Handle bar */}
          <div className="w-[100px] h-2 rounded-full bg-muted mx-auto" />

          {/* Title */}
          <h2 className="font-brand text-lg font-semibold tracking-tight text-foreground">
            Context Required
          </h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground">{description}</p>

          {/* Form */}
          <form onSubmit={handleRescore} className="flex flex-col gap-3">
            <label htmlFor="hitl-context" className="text-xs font-medium text-foreground">
              Your context
            </label>
            <textarea
              id="hitl-context"
              name="hitl-context"
              value={humanContext}
              onChange={(e) => setHumanContext(e.target.value)}
              placeholder="e.g. I led a similar project at my previous role, or I have 3 years of relevant experience not listed on my resume…"
              className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-y outline-none focus:border-border"
              style={{ minHeight: "120px" }}
            />
            <button
              type="submit"
              disabled={!humanContext.trim()}
              className={[
                "w-full py-2 text-sm font-medium rounded-[6px] transition-colors",
                humanContext.trim()
                  ? "bg-primary text-primary-foreground cursor-pointer"
                  : "bg-primary/10 text-primary cursor-not-allowed",
              ].join(" ")}
            >
              Reanalyze
            </button>
          </form>

          {/* Accept escape hatch */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handleAccept}
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Skip and accept current result
            </button>
          </div>
        </div>
      </DrawerPanel>
    </>
  );
}
