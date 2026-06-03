# PRD: Archetype System

**Status:** Draft / Ongoing
**Author:** sbasnyat
**Last updated:** 2026-06-02
**Read first:** what-good-looks-like.md

---

## Purpose

The Archetype System surfaces the real ask behind a job description and resume. It makes Dimension 4 advice — what the recruiter and hiring manager are actually looking for — specific rather than generic.

Without knowing what kind of role this is, the advice defaults to generic. With it, the product can tell a candidate which experience signals the real ask most clearly, where to position it for the 7-second scan, and what the hiring manager will probe for in the interview.

The archetype system does not affect Dimension 1 (ATS surface), Dimension 2 (demonstrated vs claimed), or Dimension 3 (vocabulary gap and translation legitimacy). Those dimensions are determined by the resume and JD texts themselves. The archetype only affects Dimension 4.

---

## What an archetype is

An archetype is a recurring pattern observed across real job postings that names what a role of that type is fundamentally trying to hire for — beyond what the requirements list says.

Two job descriptions can list identical requirements but belong to completely different archetypes. A `specialist_depth` role and a `greenfield_builder` role can both require "5+ years of software engineering experience" and "experience with distributed systems." But one is asking "have you solved this specific expensive problem before" and the other is asking "can you make good architectural decisions in undefined territory." The archetype names that difference.

Both the JD and the resume are classified. The JD classification tells you what the role is asking for (ideal and acceptable). The resume classification tells you what kind of worker this candidate has been. The match or mismatch between the two is a direct input to the advice.

---

## The six archetypes

```ts
type RoleArchetype =
  | "specialist_depth"
  | "modernisation_refactor"
  | "greenfield_builder"
  | "founding_engineer"
  | "scale_operator"
  | "growth_hire"
```

Derived from real job posting research — Cresta, Retool, Quizlet, GitLab, Valocore, BoltWise, Belfry, Liatrio, and others. Research date: 2026-06-01.

---

### specialist_depth

**Real ask:** Have you solved this specific expensive problem before, in production, and can you go deep on it?

**What it is:** A role optimising for deep expertise in one specific technology, domain, or system. The company has a defined expensive problem and needs someone who has already solved it.

**JD signals:**
- Role title names a specific technology or domain — "AI Agent Runtime Engineer", "Senior Engineer — Search Infrastructure"
- Minimum years required in a specific tool or domain
- "Deep knowledge of X required" or "expert in X"
- Multiple sub-roles all named after the same domain — signals a team built around one specific problem

**Resume signals:**
- Career spent primarily in one domain or technology
- Deep specific achievements in one area
- Publications, open source contributions, or public writing in the specialty

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: The specific technology or domain name, held for multiple years at recognisable companies
- `interviewProbePattern`: Goes very deep on one thing. Multiple follow-up questions on the strongest claimed skill. "Walk me through exactly how you built X" — not "tell me about your experience with X."

**Typical `couldWork` archetypes:** `scale_operator` (when the domain is new enough that production scale is an acceptable proxy), `modernisation_refactor` (when the expensive problem is a specific migration)

---

### modernisation_refactor

**Real ask:** Have you navigated a migration or refactor at meaningful scale before — technically and organisationally?

**What it is:** A role with a specific legacy system to modernise or a specific refactoring project to complete. The company knows what they're moving from and what they're moving to.

**JD signals:**
- Explicit mention of a legacy system alongside a target system
- "Migration", "modernisation", "replatforming", "decoupling from monolith"
- Language about managing risk and keeping systems running during transition
- Cross-functional stakeholder language — "align with business teams", "manage technical debt"

**Resume signals:**
- Before/after stories — "migrated X from Y to Z", "reduced X from Y to Z"
- Scale of system touched — team size, traffic, data volume
- Evidence of managing technical and organisational complexity simultaneously

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: A recognisable before/after achievement — migrating a specific system, reducing a specific metric, decoupling a specific dependency
- `interviewProbePattern`: How did you manage risk? How did you keep systems running? How did you get stakeholder buy-in? They probe for the messy reality of transformation work, not just the clean outcome.

**Typical `couldWork` archetypes:** `scale_operator`, `specialist_depth`

---

### greenfield_builder

**Real ask:** Can you make good architectural decisions in undefined territory and ship something new from scratch within an existing organisation?

**What it is:** Building a new product or system within an existing, stable company. The organisational context is established but the technical problem is undefined.

**JD signals:**
- "New product", "0→1", "greenfield"
- Existing company name with a new product initiative
- "Shape the technical direction", "define the architecture"
- "Partner with product and design" — implies product exists but this feature doesn't yet

**Resume signals:**
- Evidence of having built something new within an existing company
- Architectural decision-making documented — not just what was built but why
- Shipped features with measurable outcomes

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: A shipped new product or feature with clear ownership — not maintenance of existing systems
- `interviewProbePattern`: How do you make architectural decisions when there's no right answer? Walk me through the tradeoffs you considered. Tests judgment under ambiguity, not depth in any one technology.

**Typical `couldWork` archetypes:** `founding_engineer`, `modernisation_refactor`

---

### founding_engineer

**Real ask:** Can you operate without a playbook, make good decisions under existential uncertainty, and build both the product and the company simultaneously?

**What it is:** Employee 3-15 at an early stage company. The organisational context is itself undefined. The demand goes beyond engineering — judgment about what to build, comfort with uncertainty, ability to context-switch between deep technical work and customer conversations.

Generalist career patterns map naturally to this archetype. A resume showing breadth across technologies and domains is a founding engineer signal — not a weakness in this context. The `careerArcNote` in `analyzeResume` will surface this pattern explicitly.

**JD signals:**
- "Founding engineer", "early employee", "employee #N"
- "Work directly with CEO/CTO"
- "Shape engineering culture", "define technical standards from scratch"
- Equity language prominent — "meaningful equity", "get in on the ground floor"
- "True ownership" and "autonomy" language

**Resume signals:**
- Previous founding engineer or very early employee experience
- Evidence of customer interaction alongside technical work
- Breadth across the stack
- Evidence of ownership over outcomes, not just tasks

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: Previous early-stage startup experience. Technical breadth. Evidence of ownership.
- `interviewProbePattern`: Why do you want to be at an early stage company? What would you do in the first 30 days? How do you decide what to build when everything is a priority? Tests temperament and judgment as much as technical skill.

**Overqualified risk:** A Staff Engineer from a large company applying to a founding engineer role may trigger scope expectation concerns. Flag this when the signal is present.

**Typical `couldWork` archetypes:** `greenfield_builder`, `growth_hire`

---

### scale_operator

**Real ask:** Have you operated systems at this scale before and do you have the production war stories to prove it?

**What it is:** Taking something that works and making it work at 10x the load, 10x the reliability, or 10x the team size. The problem is solved — the challenge is making it handle production reality.

**JD signals:**
- Specific scale numbers — "tens of thousands of RPS", "millions of users", "global scale"
- "Proven track record at scale" — the word "proven" is load-bearing
- "Principal Engineer" or "Staff Engineer" with platform or infrastructure scope
- "Cost-per-request", "latency", "availability targets"

**Resume signals:**
- Explicit scale numbers — not "high traffic" but actual RPS, user counts, data volumes
- Production incident stories — what broke, how you found it, how you fixed it
- Evidence of architectural decisions that held up under real load
- Staff or Principal titles at companies with real scale

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: A specific scale number at a recognisable company
- `interviewProbePattern`: What's the largest system you've operated? What broke under load and how did you find it? Walk me through a specific architectural decision you made for scalability. Tests whether scale claims hold up under questioning.

**Typical `couldWork` archetypes:** `specialist_depth`, `modernisation_refactor`

---

### growth_hire

**Real ask:** Can you learn fast, deliver quickly, and grow into this role?

**What it is:** A role where the company is hiring on trajectory rather than track record. Learning speed over demonstrated experience. This archetype is becoming rarer in full-time roles due to AI tooling reducing the need for junior generalists — but it still exists at early-stage companies and in roles where the problem space is new enough that nobody has the exact experience anyway.

**JD signals:**
- "Strong ability to learn new technologies quickly"
- "We care more about how you think than what you've done"
- Most requirements listed as "bonus" or "nice to have" — few hard requirements
- Adjacent experience explicitly welcomed
- "Demonstrate a strong growth trajectory", "meaningful contributions starting from first 3 months"

**Resume signals:**
- Short career history — new grad or 1-3 years
- Evidence of learning new things quickly — multiple technologies in short time
- Side projects demonstrating initiative and curiosity

**Config properties (runtime, not LLM-derived):**
- `scanPattern`: Trajectory — what has this person built or learned recently, not what they've been doing for five years
- `interviewProbePattern`: How do you approach learning something unfamiliar? What's something you taught yourself recently? Tests coachability and growth mindset.

**Market context:** This archetype is shrinking in full-time roles as AI tooling reduces the need for junior generalists. Candidates targeting this archetype should be aware the pipeline is smaller than it was in 2021-2022.

**Typical `couldWork` archetypes:** `founding_engineer`

---

## Classification mechanism

### Why not deterministic

Archetypes are inferred from JD subtext — the combination of language, requirements structure, and implicit signals. A deterministic keyword lookup cannot reliably distinguish `specialist_depth` from `greenfield_builder` when both use similar technical vocabulary. An LLM call with the archetype definitions as context is required.

### classifyJDArchetype

A tightly constrained LLM call that reads the JD text against the six archetype definitions and returns an ideal archetype and up to two `couldWork` archetypes.

**Returns:**
```ts
jdArchetype: {
  ideal: RoleArchetype
  couldWork: [] | [RoleArchetype] | [RoleArchetype, RoleArchetype]
}
```

**`ideal`** — the archetype the company would hire if they found a perfect match. Derived from the real ask beneath the requirements list.

**`couldWork`** — archetypes the company will realistically consider given market availability. Maximum two. Empty array is valid for roles where the ideal is the only acceptable fit. For AI infrastructure roles where the domain is new, `couldWork` typically includes adjacent production-credibility archetypes — see Cresta example below.

**Constraints:** `ideal` must be one of the six `RoleArchetype` values. `couldWork` entries must differ from `ideal`. No confidence field — if the classification is uncertain, that uncertainty should be reflected in a broader `couldWork` list, not a confidence label.

**`couldWork` reasoning:** The `couldWork` list is not a softening of the ideal — it is a realistic read of which candidate profiles the company will actually interview given market reality. For a `specialist_depth` AI role where the domain is new, `couldWork: ["scale_operator"]` means: a candidate with production scale signals but no AI-specific depth is a legitimate candidate, not a stretch. This matters for scoring — a candidate matching `couldWork` lands in narrative gap territory, not honest verdict.

**Example — Cresta Senior Backend Engineer, AI Agent:**
```ts
{ ideal: "specialist_depth", couldWork: ["scale_operator"] }
```
The ideal is someone who has built production AI agent backends. The reality is that domain is new enough that production scale at Wayfair-tier companies is an acceptable proxy.

### classifyResumeArchetype

A tightly constrained LLM call that reads the resume text against the six archetype definitions and returns the archetype that best describes this candidate's current career pattern, plus a structured career arc note.

**Returns:**
```ts
candidateArchetype: RoleArchetype
careerArcNote: {
  transitions: Array<{
    from: RoleArchetype
    to: RoleArchetype
    signal: string  // one sentence — what in the resume drove this transition read
  }>
}
```

**`candidateArchetype`** — the dominant archetype today. Single value. Derived from the most recent and strongest career signals, not the full career history.

**`careerArcNote.transitions`** — structured record of meaningful archetype shifts across the career. Empty array if the career shows a consistent single archetype. Each transition names the archetypes involved and the specific resume signal that drove the read. No narrative language — factual and specific.

**Examples:**
```ts
// Consistent career — no transitions
{ candidateArchetype: "scale_operator", careerArcNote: { transitions: [] } }

// Single transition
{
  candidateArchetype: "modernisation_refactor",
  careerArcNote: {
    transitions: [{
      from: "founding_engineer",
      to: "modernisation_refactor",
      signal: "moved from two early-stage startups to Staff Engineer at Wayfair where work concentrated on PHP monolith decomposition and microservices replatforming"
    }]
  }
}

// Multiple transitions
{
  candidateArchetype: "specialist_depth",
  careerArcNote: {
    transitions: [
      {
        from: "growth_hire",
        to: "scale_operator",
        signal: "early career generalist work gave way to platform engineering at Quizlet operating at 40M user scale"
      },
      {
        from: "scale_operator",
        to: "specialist_depth",
        signal: "moved from general platform work to dedicated ML infrastructure ownership at Cresta"
      }
    ]
  }
}
```

**Note on generalist resumes:** A resume showing a broad generalist career pattern should be classified as `founding_engineer`. The `careerArcNote` transitions should note the generalist pattern explicitly in the `signal` field.

### Archetype config — runtime lookup

`scanPattern` and `interviewProbePattern` are static properties of each archetype. They are not LLM outputs — they are defined above and loaded at runtime from a typed config object:

```ts
const ARCHETYPE_CONFIG: Record<RoleArchetype, {
  scanPattern: string
  interviewProbePattern: string
}> = { ... }
```

This config is injected inline into verdict node prompts — not as a separate graph node. The verdict node function looks up config from `jdArchetype.ideal` before assembling the prompt. No graph edge, no LangSmith trace entry for a dictionary lookup.

### Archetype match tiers

The comparison between `candidateArchetype` and `jdArchetype` produces a coarse routing signal consumed by `analyzeFit`:

```
candidateArchetype === jdArchetype.ideal     → strong match territory (fitScore 75+)
candidateArchetype in jdArchetype.couldWork  → narrative gap territory (fitScore 50–74)
neither                                      → honest verdict territory (fitScore <50)
```

This is a coarse prior — fit score and battle card evidence are the fine-grained signal. The archetype match tells `analyzeFit` where to look and what to weight, not what the final score must be.

### Shared vocabulary

Both classification calls use the same six `RoleArchetype` values. The JD and resume speak the same language. A mismatch — `candidateArchetype: specialist_depth`, `jdArchetype.ideal: founding_engineer`, `jdArchetype.couldWork: []` — is directly interpretable advice signal. A partial match — `candidateArchetype: scale_operator`, `jdArchetype.couldWork: ["scale_operator"]` — means narrative gap, not rejection.

---

## RAG integration (future)

Archetypes are the primary key for future RAG retrieval. When the Upwork project brief pipeline is built, briefs are stored with `jdArchetype.ideal` as a metadata field. At advice generation time for `honest_verdict` and `narrative_gap` scenarios, relevant briefs are retrieved by matching the JD ideal archetype against stored briefs.

This is a Phase 2 feature. The archetype taxonomy must remain stable before the RAG pipeline is built against it.

---

## Research sources

Real JDs used to derive and validate archetypes:
- Cresta: Senior Software Engineer Backend AI Agent, Senior Staff ML Engineer AI Agent, Software Engineer Early Career (`specialist_depth` ideal / `scale_operator` couldWork, `growth_hire`)
- Retool: Software Engineer AI Agents (`greenfield_builder`)
- Quizlet: Principal Engineer Platform Architecture (`scale_operator`)
- GitLab: Principal Engineer Infrastructure Platforms (`scale_operator`)
- Liatrio: Principal Application Modernization Engineer (`modernisation_refactor`)
- Valocore, BoltWise, Belfry, Bottleneck Labs, Paradigm: Founding Engineer roles (`founding_engineer`)

Research date: 2026-06-01. Archetypes should be re-validated against current job postings before adding new ones. No new archetype ships without eval cases.

---

## Generalist transformation — removal note

Generalist transformation was considered as a seventh archetype and removed. The capability still exists and is valuable but no longer appears as a standalone demand signal in full-time job postings at meaningful frequency. Companies hiring for breadth are almost exclusively early-stage startups, captured by `founding_engineer`. At larger companies, breadth requirements have been absorbed into `specialist_depth` roles augmented by AI tooling. The `careerArcNote.transitions` signal field in `classifyResumeArchetype` should note generalist patterns explicitly when present so the advice can address them directly.