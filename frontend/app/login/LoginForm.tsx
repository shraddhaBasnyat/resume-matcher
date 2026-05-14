"use client"

import { useState } from "react"
import { Footprints } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldLabel } from "@/components/ui/field"
import { signIn, signUp, signInWithGoogle } from "@/app/auth/actions"

type Tab = "signin" | "signup"

interface Props {
  initialError: string | null
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 6.293C4.672 4.166 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

export function LoginForm({ initialError }: Props) {
  const [tab, setTab] = useState<Tab>("signin")

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-card border border-border rounded-[12px] p-8 flex flex-col gap-6" style={{ boxShadow: "var(--shadow-card)" }}>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary shrink-0">
            <Footprints size={18} className="text-primary-foreground" />
          </div>
          <span className="font-brand font-bold text-sm text-primary">JobInit</span>
        </div>

        {/* Heading */}
        <h1 className="text-lg font-semibold text-foreground">
          {tab === "signin" ? "Sign in to JobInit" : "Create your account"}
        </h1>

        {/* Error */}
        {initialError && (
          <p className="text-xs text-destructive">{initialError}</p>
        )}

        {/* Google OAuth */}
        <form action={signInWithGoogle}>
          <Button type="submit" variant="outline" className="w-full gap-2 h-10">
            <GoogleIcon />
            Continue with Google
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <hr className="flex-1 border-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <hr className="flex-1 border-border" />
        </div>

        {/* Email/password form */}
        <form action={tab === "signin" ? signIn : signUp} className="flex flex-col gap-4">
          <Field className="flex flex-col gap-1.5">
            <FieldLabel className="text-sm font-medium text-foreground">Email</FieldLabel>
            <Input name="email" type="email" placeholder="you@example.com" required />
          </Field>
          <Field className="flex flex-col gap-1.5">
            <FieldLabel className="text-sm font-medium text-foreground">Password</FieldLabel>
            <Input name="password" type="password" placeholder="••••••••" required />
          </Field>
          <Button type="submit" className="w-full h-10">
            {tab === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-xs text-muted-foreground text-center">
          {tab === "signin" ? (
            <>
              {"Don't have an account? "}
              <button
                type="button"
                onClick={() => setTab("signup")}
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              {"Already have an account? "}
              <button
                type="button"
                onClick={() => setTab("signin")}
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>

      </div>
    </div>
  )
}
