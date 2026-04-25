"use client";

import { Dialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

function DialogRoot(props: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root {...props} />;
}

function DialogTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger className={cn(className)} {...props} />;
}

function DialogPortal(props: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal {...props} />;
}

function DialogBackdrop({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Backdrop>) {
  return (
    <Dialog.Backdrop
      className={cn("fixed inset-0 z-40 bg-foreground/20", className)}
      {...props}
    />
  );
}

function DialogPopup({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Popup>) {
  return (
    <Dialog.Popup
      className={cn(
        "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        "w-[600px] rounded-[8px] border border-border bg-background p-6",
        "flex flex-col gap-4",
        className
      )}
      style={{ boxShadow: "0px 8px 24px rgba(0,0,0,0.12)" }}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogClose({
  className,
  ...props
}: React.ComponentProps<typeof Dialog.Close>) {
  return (
    <Dialog.Close
      className={cn(
        "absolute right-0 top-0 cursor-pointer text-muted-foreground/70",
        className
      )}
      {...props}
    />
  );
}

export {
  DialogRoot as Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogClose,
};
