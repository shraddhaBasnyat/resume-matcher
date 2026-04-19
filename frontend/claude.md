# JobInit Frontend — Claude Context

## Project Overview
JobInit is a resume-to-job matching app built with Next.js 14 (App Router), TypeScript, 
and Tailwind CSS. The new v2 UI lives at `/v2` and is built in parallel with the legacy 
UI at `/` which must not be touched.

## Architecture
- **Entry point**: `frontend/app/v2/page.tsx` — "use client", uses `useMatchRunner` hook
- **Hook**: `frontend/hooks/useMatchRunner.ts` — owns all app state (idle | running | 
  interrupted | completed), SSE streaming, cancellation. Reusable, not coupled to any page.
- **Backend**: Express on port 3001 (Render in production). URL via 
  `NEXT_PUBLIC_BACKEND_URL` env var.
- **Legacy components**: `frontend/components/match/` — do not touch

## Folder Structure (v2)
components/
ui/           ← Base UI primitives (button, avatar — no Radix, no shadcn default)
layout/       ← Header, UploadSection (global chrome, shared across all tabs)
resume-init/  ← ResumeInit tab results components
company-init/ ← Future (locked/waitlist)
arc-init/     ← Future (locked/waitlist)

## UI Framework Rules
- **Base UI**: `@base-ui/react` (NOT Radix). Import pattern: 
  `import { Menu } from "@base-ui/react/menu"`
- **Tailwind**: Used for layout/structure. Colors always via CSS variables.
- **No inline styles for colors** — use Tailwind classes with CSS variable tokens
- **Inline styles only for**: structural one-offs (`minHeight`, specific px values not 
  in Tailwind scale), and `boxShadow: var(--shadow-card)`
- **Icons**: Lucide React throughout

## Design System — HSL Tokens
All colors use bare HSL channel values in CSS variables (shadcn convention).
Tailwind config maps them as `hsl(var(--token) / <alpha-value>)` for opacity modifier support.

### CSS Variables (globals.css)
```css
--background:              60 67% 97%;
--foreground:              283 48% 14%;
--muted:                   60 56% 90%;
--muted-foreground:        289 12% 40%;
--card:                    0 0% 100%;
--card-foreground:         283 48% 14%;
--popover:                 0 0% 100%;
--popover-foreground:      283 48% 14%;
--border:                  60 33% 84%;
--input:                   60 33% 84%;
--primary:                 289 42% 35%;
--primary-foreground:      60 67% 97%;
--secondary:               249 100% 91%;
--secondary-foreground:    283 48% 14%;
--accent:                  249 100% 94%;
--accent-foreground:       283 48% 14%;
--destructive:             0 42% 41%;
--destructive-foreground:  60 67% 97%;
--success:                 60 42% 35%;
--success-foreground:      60 67% 97%;
--ring:                    289 42% 35%;
--shadow-card:             0px 4px 4px rgba(0, 0, 0, 0.10);
--radius:                  0.5rem;
--radius-md:               0.375rem;
--radius-sm:               0.25rem;
```

### Tailwind Color Classes Available
bg-background, bg-foreground
bg-primary, bg-primary/10, text-primary, text-primary-foreground
bg-muted, bg-muted/30, text-muted-foreground
bg-card, text-card-foreground
bg-border, border-border, border-border/50
bg-secondary, text-secondary-foreground
bg-accent, text-accent-foreground
bg-destructive, text-destructive-foreground
bg-success, text-success, text-success-foreground
shadow-card

### Typography
- **Body font**: Inter (loaded in layout.tsx via next/font/google)
- **Brand font**: JetBrains Mono — loaded as `--font-brand` CSS variable via 
  `JetBrains_Mono({ variable: "--font-brand" })` in layout.tsx
- **Usage**: `className="font-brand font-bold"` for the JobInit wordmark
- **Tailwind config**: `fontFamily: { brand: ["var(--font-brand)"] }`

## Components Built

### Header (`components/layout/Header.tsx`)
- Sticky, full-width, height 88px, `bg-background`, `border-b border-success`
- Left: 32x32 `bg-primary rounded-full` circle + Lucide `Footprints` (18px, 
  `text-primary-foreground`) + "JobInit" wordmark (`font-brand font-bold text-sm text-primary`)
- Right: Avatar with "JI" initials only — no image, no auth yet
- Dropdown: Base UI `Menu` primitive with Profile, Billing, Settings, Log out items
- "use client" required for dropdown state

### UploadSection (`components/layout/UploadSection.tsx`)
- Controlled by local `useState(isExpanded)` — NOT by appState
- User manually toggles via chevron clicks
- **Expanded**: two equal cards side by side (`flex-1`), Button-Row centered below
- **Collapsed**: single row with "Upload Section" label + ChevronDown, `border-b border-border`
- Resume-Card: `bg-background border border-border/50 shadow-card rounded-none`
- Drop zone: 214x168px, `bg-white border-2 border-dashed border-border rounded-xl`
  - 3 states: empty, loading (`parseLoading`), uploaded (filename + char count)
  - `// TODO: add remove/replace file action`
- JD-Card: same card styling, textarea `bg-muted/30 border border-border/50 rounded-md`
- Button: "Analyze Match", `disabled={!canMatch}`, calls `handleMatch()`
- Filename tracked in local useState — `useMatchRunner` doesn't expose it

### Avatar (`components/ui/avatar.tsx`)
- Built on `@base-ui/react/avatar`
- Initials only — `AvatarImage` removed entirely, never use image
- When auth added: populate initials from real user name, still no image

## Key Patterns

### Page Structure (v2/page.tsx)
```tsx
<div className="min-h-screen bg-muted/30">
  <Header />                    {/* sticky, outside padding */}
  <div style={{ padding: "8px 24px" }}>
    <UploadSection ... />
    {/* results section coming next */}
  </div>
</div>
```

### Props from useMatchRunner needed for UploadSection
```ts
appState, resumeText, jobDescription, parseLoading, parseError,
fileInputRef, canMatch, setJobDescription, handleFileUpload, handleMatch
```

### Icon wrapper pattern (used in card headers)
```tsx
<div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
  <FileText size={24} className="text-primary" />
</div>
```

## SSE Events (from backend)
| Event | Payload |
|---|---|
| `meta` | threadId, rootRunId, runStartTime |
| `node_start` | node, timestamp |
| `node_done` | node, durationMs, timestamp |
| `completed` | full MatchResponse under `result` |
| `interrupted` | fitScore, contextPrompt, threadId |
| `error` | error, message |

## 4 Scenarios (drive ResumeInit results UI)
| Scenario | fitScore | atsScore |
|---|---|---|
| confirmed_fit | ≥75 | ≥75 |
| invisible_expert | ≥75 | <75 |
| narrative_gap | 50–74 | any |
| honest_verdict | <50 | any |

## 3 Tabs — Emotional Progress Arc
| Tab | Label | Progress |
|---|---|---|
| ResumeInit | "Technical Alignment: Get the Interview" | ~33% |
| CompanyInit | "Tactical Intelligence: Win the Offer" | ~66% |
| ArcInit | "Strategic Roadmap: Own the Career Path" | ~100% |
CompanyInit and ArcInit are locked — show waitlist email capture only.

## What's Next (Resume-Init results section)
- Stepper (4 nodes driven by SSE: Parsing Resume, Parsing Job, Scoring Match, Analyzing Gap)
- ScoreCard (score circle + headline + 3 narrative paragraphs)
- 4 result Accordions (content varies by scenario)
- Tabs component (ResumeInit active, CompanyInit + ArcInit locked)
- Skeleton loading state for all results until graph completes
- All results populate simultaneously when `completed` SSE event fires

## Do Not Touch
- `frontend/app/page.tsx` (legacy)
- `frontend/components/match/` (legacy)
- HITL feature (HitlForm, handleRescore, handleAccept) — ignore for now

## Browser vs Figma Color Rendering

Figma renders transparency on a gray canvas, not white. Any Figma color using low opacity
(e.g. rgba(242, 242, 217, 0.3)) will appear more saturated/visible in Figma than in the
browser, where it blends with the white <body> instead.

Rule of thumb: double the opacity value when translating from Figma to browser.
Example: 30% opacity in Figma → use 50-60% in the browser.

Current implementation: page wrapper uses bg-muted/50 (not bg-muted/30 as in Figma).
Body background stays white (default) — do not add background-color to body in globals.css.