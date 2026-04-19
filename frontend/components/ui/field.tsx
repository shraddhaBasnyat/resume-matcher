"use client"

import { Field } from "@base-ui/react/field"
import { cn } from "@/lib/utils"

function FieldRoot({ className, ...props }: React.ComponentProps<typeof Field.Root>) {
  return <Field.Root className={cn(className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Field.Label>) {
  return <Field.Label className={cn(className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<typeof Field.Description>) {
  return <Field.Description className={cn(className)} {...props} />
}

export { FieldRoot as Field, FieldLabel, FieldDescription }
