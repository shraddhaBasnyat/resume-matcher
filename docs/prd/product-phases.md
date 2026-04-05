# Product Phases

---

## Phase 1 — Does the score reflect reality?

**Question this phase answers:** Is the match score independently meaningful on two dimensions — ATS surface and semantic fit — or is it a single blended number that obscures what's actually wrong?

**Key tasks:**

- Build ATS parse nodes (`parseResumeATS`, `parseJobATS`) — mechanical, literal extraction
- Build `atsAnalysis` node — produces `atsScore`, `atsProfile`, owns critical field validation
- Build fit parse nodes (`parseResumeFit`, `parseJobFit`) — semantic, inferential, benefit of the doubt
- Wire `intent` and `intentContext` into request body — replace `humanContext` on first run
- Update `scoreMatch` to receive both `atsProfile` and fit parse outputs
- Implement short-circuit conditions — unreadable resume, missing critical fields, intent-aware keyword gap
- Update routing to two-dimensional conditional edge logic

**Done when:** Run your own resume against the real AI agent dev job postings from the archetype research (Cresta, Superblocks, NYT, LaunchDarkly, Applied Intuition). ATS score and fit score are independently meaningful. Routing correctly reflects which problem exists. Validated across at least 4 of the real job postings.

---

## Phase 2 — Does the analysis feel specific?

**Question this phase answers:** Does the output tell this candidate something specific about their situation, or does it produce advice that could apply to anyone?

**Key tasks:**

- Add `sourceRole` to `ResumeSchema`, `targetRole` to `JobSchema`
- Build archetype types and `ARCHETYPES` registry — `backend_swe → ai_agent_dev` only
- Build `deriveTransitionType` and `buildContext` functions
- Wire `archetypeContext` into `scoreMatch` and `analyzeArchetypeGap` as selective injection
- Build all scenario analysis nodes — `analyzeStrongMatch`, `analyzeNarrativeGap`, `analyzeArchetypeGap`, `analyzeATSGap`, `analyzeSkepticalReconciliation`
- Build `analyzeRoadmap` node — powered by archetype data for known transitions, generic fallback for unknown ones. No separate research required — archetype JSON already contains milestones, timeline estimates, and portfolio projects.
- Build eval harness — minimum 10 cases per scenario node, 3 metrics: score accuracy, gap quality (LLM-as-judge), advice specificity
- Iterate on prompt content and archetype data based on eval results
- Soft beta — recruit 2-3 people personally at different points in the backend SWE → AI agent dev transition

**Soft beta profiles to recruit:**

- Someone who just started learning LangGraph — no shipped projects yet
- Someone who has shipped one agent project, not yet job searching
- Someone actively interviewing for AI agent dev roles

**Done when:** Your own resume against a real AI agent dev posting produces output you would act on — specific bullet points, specific keywords, specific gaps named from the archetype research. At least 2 of 3 soft beta users confirm the output feels specific to their situation. Eval harness gap quality score consistently above threshold.

---

## Phase 3 — Does it work with real users?

**Question this phase answers:** Is the output useful enough in practice that someone would share it or come back?

**Key tasks:**

- Chrome extension — intent selector, intentContext dropdowns, result display including `contextPrompt` and `atsProfile` keywords
- Public beta onboarding — waitlist, invite flow, Supabase usage tracking
- Collect feedback on match and roadmap runs from users you didn't hand-pick
- Fix issues that only appear with real resumes and real job postings at volume

**Done when:** Beta users who found the tool on their own complete a match or roadmap run and the output is useful enough they share it, act on it, or come back for another run.