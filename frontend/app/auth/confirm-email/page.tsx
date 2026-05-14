import { Footprints } from "lucide-react"

export default function ConfirmEmailPage() {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <div
        className="w-full max-w-[400px] bg-card border border-border rounded-[12px] p-8 flex flex-col gap-6"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary shrink-0">
            <Footprints size={18} className="text-primary-foreground" />
          </div>
          <span className="font-brand font-bold text-sm text-primary">JobInit</span>
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-lg font-semibold text-foreground">Check your inbox</h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to your email address. Click the link to activate your account.
          </p>
        </div>

        <p className="text-xs text-muted-foreground">
          {"Didn't receive it? "}
          <a href="/login" className="text-primary underline-offset-4 hover:underline">
            Try signing in again
          </a>
        </p>
      </div>
    </div>
  )
}
