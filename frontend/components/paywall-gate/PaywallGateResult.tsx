import { Lock } from "lucide-react"
import { Field, FieldDescription } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

interface PaywallGateResultProps {
  headline: string
}

export function PaywallGateResult({ headline }: PaywallGateResultProps) {
  return (
    <div className="flex flex-col justify-center items-center p-12 gap-4 flex-1 w-full bg-card">
      <div className="w-16 h-16 rounded-[25px] bg-primary flex items-center justify-center">
        <Lock size={48} className="text-primary-foreground" />
      </div>

      <p className="text-sm font-medium text-foreground text-center w-[612px]">
        {headline}
      </p>

      <div className="flex flex-col gap-1.5 w-[384px]">
        <Field>
          <div className="flex flex-row items-center gap-2 w-[384px] h-10">
            <Input placeholder="Email" />
            <button className="w-[100px] h-10 bg-primary text-primary-foreground text-sm font-medium rounded-md">
              Join Waitlist
            </button>
          </div>
          <FieldDescription className="text-sm text-muted-foreground">
            Enter your email address
          </FieldDescription>
        </Field>
      </div>
    </div>
  )
}
