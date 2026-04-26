"use client";

import { cn } from "@/lib/utils";

function DrawerBackdrop({
  open,
  className,
}: {
  open: boolean;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={cn("fixed inset-0 z-40 bg-foreground/20", className)}
    />
  );
}

function DrawerPanel({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl",
        "transition-transform duration-300 ease-out",
        open ? "translate-y-0" : "translate-y-full",
        className
      )}
    >
      {children}
    </div>
  );
}

export { DrawerBackdrop, DrawerPanel };
