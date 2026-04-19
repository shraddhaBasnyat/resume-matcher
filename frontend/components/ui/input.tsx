import { cn } from "@/lib/utils"

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex-1 h-10 px-3 border border-border rounded-md text-base text-muted-foreground placeholder:text-muted-foreground bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
