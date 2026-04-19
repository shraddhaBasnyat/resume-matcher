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
```
components/
  ui/           ← Base UI primitives (button, avatar, tabs, progress — no Radix, no shadcn default)
  layout/       ← Header, UploadSection (global chrome, shared across all tabs)
  resume-init/  ← ResumeInit tab results components
    accordion-config.ts  ← permanent: maps backend keys → { question, subtitle }
    dummy-data.ts        ← TEMPORARY: delete when real SSE data wired up
  company-init/ ← Future (locked/waitlist)
  arc-init/     ← Future (locked/waitlist)
```

## UI Framework Rules
- **Base UI**: `@base-ui/react` (NOT Radix). Import pattern: 
  `import { Menu } from "@base-ui/react/menu"`
- **Tailwind**: Used for layout/structure. Colors always via CSS variables.
- **No inline styles for colors** — use Tailwind classes with CSS variable tokens
- **Inline styles only for**: structural one-offs (`minHeight`, specific px values not 
  in Tailwind scale), and `boxShadow: "0px 4px 4px rgba(...)"` when it's a design-specific 
  shadow that doesn't map to a token
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
```
bg-background, bg-foreground
bg-primary, bg-primary/10, bg-primary/40, text-primary, text-primary-foreground
bg-muted, bg-muted/30, bg-muted/50, text-muted-foreground
bg-muted-foreground/10 (used for skeleton bars in BattleCard)
bg-card, text-card-foreground
bg-border, border-border, border-border/50
bg-secondary, text-secondary-foreground
bg-accent, text-accent-foreground
bg-destructive, text-destructive-foreground
bg-success, text-success, text-success-foreground
shadow-card
```

### Typography
- **Body font**: Inter (loaded in layout.tsx via next/font/google)
- **Brand font**: JetBrains Mono — loaded as `--font-brand` CSS variable via 
  `JetBrains_Mono({ variable: "--font-brand" })` in layout.tsx
- **Usage**: `className="font-brand font-bold"` for the JobInit wordmark; 
  `font-brand font-medium` for tab labels and progress labels
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
- Button: "Analyze Match" wrapped in `<form onSubmit={handleMatch}>` — hook returns 
  `(e: React.FormEvent) => Promise<void>`, not `() => void`
- `canMatch` disables the submit button; `disabled={!canMatch}` on the button
- Filename tracked in local useState — `useMatchRunner` doesn't expose it
- `appState` is NOT a prop — UploadSection has no awareness of match run state

### Avatar (`components/ui/avatar.tsx`)
- Built on `@base-ui/react/avatar`
- Initials only — `AvatarImage` removed entirely, never use image
- When auth added: populate initials from real user name, still no image

### Tabs (`components/ui/tabs.tsx`)
- Thin wrappers around `@base-ui/react/tabs`
- Exports: `Tabs` (Root), `TabsList` (List), `TabsTrigger` (Tab), `TabsContent` (Panel)
- **CRITICAL**: Base UI sets `data-active` on the active tab — NOT `data-selected`
  Active selector: `data-[active]:bg-card data-[active]:shadow-sm data-[active]:text-foreground`
- **CRITICAL**: Do NOT use `pointer-events-none` on locked/disabled tabs — it blocks clicks 
  on ALL tabs including the unlocked one. Use `disabled` prop + `opacity-60 cursor-not-allowed` only.
- CompanyInit and ArcInit tabs are no longer disabled — all three tabs are fully clickable

### ProgressBar (`components/ui/progress.tsx`)
- Wraps `@base-ui/react/progress`
- `Progress.Indicator` width driven by `style={{ width: \`${value}%\` }}` — NOT a CSS var
- Track: `bg-secondary`, fill: `bg-primary`

### ResultsHeader (`components/resume-init/ResultsHeader.tsx`)
- Exports `TabId = "resume-init" | "company-init" | "arc-init"`
- Height 66px, `border-b border-border/50`, flex row, `px-4`
- Left: tab pill switcher (`bg-muted rounded-[6px]` list, `font-brand font-medium text-xs` triggers)
- Right: `w-[414px]` progress section — `progressLabel` text + `ProgressBar`
- TABS config drives both the switcher and progress display:
  ```ts
  { id: "resume-init",  label: "ResumeInit",   locked: false, progress: 33,  progressLabel: "Technical Alignment: Get the Interview" }
  { id: "company-init", label: "CompanyInit",  locked: true,  progress: 66,  progressLabel: "Tactical Intelligence: Win the Offer" }
  { id: "arc-init",     label: "ArcInit",      locked: true,  progress: 100, progressLabel: "Strategic Roadmap: Own the Career Path" }
  ```

### MainResultsStage (`components/resume-init/MainResultsStage.tsx`)
- Owns `activeTab` state; accepts `className` prop
- Outer container: `bg-background border border-border/50 shadow-card flex flex-col min-h-[600px]`
- resume-init slot: wrapped in `<div className="p-6">`, renders `<ResultsTop>` + `<FitAdviceAccordion>` + `<ScenarioSummary>`
- company-init / arc-init slots: each wrapped in `<div className="flex flex-col flex-1">` so the paywall fills remaining height below the header
- All data sourced from `dummy-data.ts` with `// TODO` — replace with `useMatchRunner` completed event

### Stepper (`components/resume-init/Stepper.tsx`)
- Container: `flex flex-col w-[218px] border-r border-success pt-6 pb-6 pl-6 pr-4`
- 3 node statuses with distinct visuals:
  - **done**: `CircleCheck` icon (`text-success`) + green connector + `text-success` label + duration in seconds
  - **active**: `w-6 h-6 bg-primary rounded-full` with `LoaderCircle` inside + muted connector + `font-bold text-primary` label
  - **idle**: `w-6 h-6 bg-muted border border-border rounded-full` + muted connector + `text-success` label (olive, per spec)
- Last node has no connector div (checked via `isLast = index === nodes.length - 1`)
- `durationMs` formatted as `((ms ?? 0) / 1000).toFixed(1) + "s"`

### BattleCard (`components/resume-init/BattleCard.tsx`)
- Container: `flex flex-row items-center py-8 px-6 gap-4 bg-muted border border-border rounded-[24px]`
  + `style={{ width: "650px", height: "314px", boxShadow: "0px 4px 4px rgba(229, 229, 202, 0.5)" }}`
  (card shadow uses warm beige rgba — not the standard shadow-card token)
- **Skeleton** (`isLoading`): `bg-muted-foreground/10` circle + `bg-primary/40` title bar + 
  3 groups of 2 `bg-muted-foreground/10` bars (`SKELETON_GROUPS = [0,1,2]`)
- **Content**: score circle `w-[100px] h-[100px] rounded-full bg-primary overflow-hidden` +
  `font-semibold text-5xl leading-none text-primary-foreground` score number
  + headline + paragraphs column
- `overflow-hidden` on score circle is required — without it, large text clips outside the circle

### ResultsTop (`components/resume-init/ResultsTop.tsx`)
- `flex flex-row justify-center items-center gap-[72px] mx-auto`
  + `style={{ width: "940px", height: "314px" }}`
- Props: `{ nodes, isLoading, score?, headline?, bulletPoints? }` — all threaded to BattleCard
- `mx-auto` centers within the `p-6` content area of MainResultsStage

### FitAdviceAccordion (`components/resume-init/FitAdviceAccordion.tsx`)
- Container: `flex flex-col p-6 bg-white w-full`
  (uses `bg-white` not `bg-background` — spec calls for pure white here)
- Props:
  ```ts
  { isLoading: boolean; items?: { key: string; bulletPoints: string[] }[] }
  ```
- Each item's `key` is looked up in `ACCORDION_CONFIG` (from `accordion-config.ts`) to get
  `question` (title) and `subtitle`. Fallback: `key` as title, `"N items found"` as subtitle.
- **Skeleton** (`isLoading`): 4 static rows, each with muted circle + 2 grey bars + ChevronDown
- **Accordion** (`!isLoading`): `@base-ui/react/accordion`
  ```ts
  import { Accordion } from "@base-ui/react/accordion"
  ```
  - `Accordion.Root defaultValue={[]} multiple={false}` — starts collapsed, single-open
  - `Accordion.Item value={i}` → `Accordion.Header` → `Accordion.Trigger` → `Accordion.Panel`
  - Trigger: `bg-transparent group` — `group` enables Tailwind group-data pattern for chevron
  - Summary line: `${item.bulletPoints.length} ${config.subtitle}`
  - Panel: `<ul>` with `<li>` per bullet point (not a paragraph)
- **CRITICAL — chevron rotation**: `data-panel-open` is set on `Accordion.Trigger`, not child 
  elements. Use Tailwind `group` on the trigger + `group-data-[panel-open]:rotate-180` on ChevronDown:
  ```tsx
  <Accordion.Trigger className="... group">
    <ChevronDown className="transition-transform group-data-[panel-open]:rotate-180" />
  </Accordion.Trigger>
  ```
  `data-[panel-open]:rotate-180` directly on the chevron will NOT work.

### ScenarioSummary (`components/resume-init/ScenarioSummary.tsx`)
- Props: `{ scenario: string; text: string }`
- Left `border-l-4 border-primary` accent block, `bg-white px-6 py-5`
- Bold scenario label (`font-semibold text-sm text-foreground`) above body paragraph
- Generic name — works for all 4 scenarios (confirmed_fit, invisible_expert, narrative_gap, honest_verdict)

### Field (`components/ui/field.tsx`)
- Thin wrapper around `@base-ui/react/field`
- Exports: `Field` (Root), `FieldLabel` (Label), `FieldDescription` (Description)
- Import pattern: `import { Field, FieldLabel, FieldDescription } from "@/components/ui/field"`

### Input (`components/ui/input.tsx`)
- Plain styled HTML `<input>` wrapper (Base UI has no Input primitive)
- Base classes: `flex-1 h-10 px-3 border border-border rounded-md text-base text-muted-foreground placeholder:text-muted-foreground bg-background`
- Import pattern: `import { Input } from "@/components/ui/input"`

### PaywallGateResult (`components/paywall-gate/PaywallGateResult.tsx`)
- Shared paywall/waitlist component used by both locked tabs
- Props: `{ headline: string }`
- Container: `flex flex-col justify-center items-center p-12 gap-4 flex-1 w-full bg-card`
- Lock icon: `w-16 h-16 rounded-[25px] bg-primary` container + `<Lock size={48} className="text-primary-foreground" />`
- Headline: `text-sm font-medium text-foreground text-center w-[612px]`
- Input block: `flex flex-col gap-1.5 w-[384px]` wrapping a `<Field>`:
  - Input row `flex flex-row items-center gap-2 w-[384px] h-10`: `<Input placeholder="Email" />` + "Join Waitlist" button (`w-[100px] h-10 bg-primary text-primary-foreground text-sm font-medium rounded-md`)
  - `<FieldDescription>Enter your email address</FieldDescription>`
- No form state or submit handler — static UI only, wire up later

### CompanyInitResult (`components/company-init/CompanyInitResult.tsx`)
- Thin wrapper: renders `<PaywallGateResult>` with CompanyInit headline
- Headline: "Deep-dive company analysis and negotiation strategy are currently locked for early testers."

### ArcInitResult (`components/arc-init/ArcInitResult.tsx`)
- Thin wrapper: renders `<PaywallGateResult>` with ArcInit headline
- Headline: "Don't just land the role—own your trajectory and lock in your path to seniority."

## Key Patterns

### Page Structure (v2/page.tsx)
```tsx
<div className="min-h-screen bg-muted/50">
  <Header />                    {/* sticky, outside padding */}
  <div style={{ padding: "8px 24px" }}>
    <UploadSection ... />
    <MainResultsStage className="mt-2" />
  </div>
</div>
```

### Props from useMatchRunner needed for UploadSection
```ts
resumeText, jobDescription, parseLoading, parseError,
fileInputRef, canMatch, setJobDescription, handleFileUpload, handleMatch
```
Note: `handleMatch` is `(e: React.FormEvent) => Promise<void>` — wrap button in `<form onSubmit={handleMatch}>`.

### Icon wrapper pattern (used in card headers)
```tsx
<div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
  <FileText size={24} className="text-primary" />
</div>
```

### Skeleton bar pattern
```tsx
<div className="w-[250px] h-[16px] bg-muted rounded-[6px]" />
```
Use `bg-muted` for lighter bars, `bg-muted-foreground/10` for very subtle bars on muted backgrounds.

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
CompanyInit and ArcInit show a paywall/waitlist gate (PaywallGateResult). All three tabs are clickable.

## What's Next
- Wire real SSE data from `useMatchRunner` `completed` event — replace all `dummy-data.ts` 
  imports in `MainResultsStage` with live state from the hook
- Delete `dummy-data.ts` once real data is connected
- Skeleton loading state: `isLoading={true}` on ResultsTop/FitAdviceAccordion until 
  `completed` event fires; `isLoading={false}` once it does

## Do Not Touch
- `frontend/app/page.tsx` (legacy)
- `frontend/components/match/` (legacy)
- HITL feature (HitlForm, handleRescore, handleAccept) — ignore for now

## Browser vs Figma Color Rendering

Figma renders transparency on a gray canvas, not white. Any Figma color using low opacity
(e.g. rgba(242, 242, 217, 0.3)) will appear more saturated/visible in Figma than in the
browser, where it blends with the white `<body>` instead.

Rule of thumb: double the opacity value when translating from Figma to browser.
Example: 30% opacity in Figma → use 50-60% in the browser.

Current implementation: page wrapper uses `bg-muted/50` (not `bg-muted/30` as in Figma).
Body background stays white (default) — do not add `background-color` to body in globals.css.

## Base UI Gotchas

- **Tabs active state**: attribute is `data-active`, not `data-selected`. Selector: `data-[active]:...`
- **Accordion chevron**: `data-panel-open` lives on `Accordion.Trigger`. Use `group` + 
  `group-data-[panel-open]:...` on children — direct `data-[panel-open]:...` on a child won't fire.
- **Accordion default**: `multiple` defaults `false` (single-open). Pass `defaultValue={[]}` for 
  all-collapsed start. No `type="single"` prop exists.
- **Disabled tabs**: `pointer-events-none` blocks clicks on ALL tabs in the list, not just 
  the disabled one. If disabling: use `disabled` prop + `opacity-60 cursor-not-allowed` only — never `pointer-events-none`.
- **ProgressBar indicator**: width must be set via `style={{ width: \`${value}%\` }}` — 
  the `--progress-value` CSS variable approach does not work with this version.
