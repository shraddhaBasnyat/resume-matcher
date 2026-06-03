# What Good Looks Like

**Status:** Draft / Ongoing
**Author:** sbasnyat
**Last updated:** 2026-06-02
**Related documents:** prd-archetype-system.md, prd-graph-architecture.md

---

## What JobInit actually does

Most resume tools ask: does my resume match this job? JobInit asks a different question: am I actually ready for this opportunity — and if not, what's the honest gap and what do I do about it?

That's a fundamentally different product. A resume matcher optimises your presentation. JobInit diagnoses your readiness.

A user who gets a complete JobInit analysis walks away knowing four things:

- Whether to apply
- What to fix before applying
- What to be honest about in their application
- What to prepare before the interview

This document defines what "good" means for each of those four answers. It is the standard against which every output is measured. When advice meets every dimension here, it is good advice. When it fails any dimension, it is not — regardless of how fluent, structured, or confident it sounds.

---

## The specificity test

Before anything else, one test applies to every dimension:

**Could this output have been written without reading this specific resume and this specific job description?**

If yes — it fails. Regardless of how well-structured or confident it sounds. Generic advice is the primary failure mode of LLM-powered career tools. Fluent and generic is worse than honest and sparse, because it creates the appearance of insight without delivering it.

This test applies independently to every piece of advice the product generates. It is the single most important quality signal.

---

## The four dimensions

### Dimension 1 — ATS Surface

**What it means**

Before a human reads a resume, automated systems filter it. Real ATS systems use named entity recognition and Boolean search across parsed fields. They are not doing semantic matching. A perfectly qualified candidate can be invisible simply because their resume uses one term where the job description uses another, or because their formatting broke parsing before the text was ever read.

This dimension answers: does this resume surface mechanically to the right people, and if not, what specifically needs to change?

**What good advice looks like**

- Names specific formatting problems — not "possible formatting issues" but the exact problem and why it matters for ATS parsing
- Names specific keyword gaps — the exact term the resume uses, the exact term the JD requires, and why they don't map automatically
- Distinguishes between terms present with demonstrated context vs terms present as bare mentions — a bare mention does not clear the recruiter filter in practice
- Shows the search terms a recruiter for this specific role would actually use — role-specific, not generic
- Produces before/after rewrites only where the underlying analogy is genuine — never on vocabulary washing

**What failure looks like**

- Generic keyword lists that could apply to any resume against any JD
- "Consider adding relevant keywords" without naming the specific keywords and where they're missing
- Vague formatting flags without naming the specific problem
- Producing terminology diffs where the underlying analogy is not legitimate
- Advice that would be identical for a different resume against the same JD

---

### Dimension 2 — Demonstrated vs Claimed

**What it means**

A resume is a claim document. Anyone can write "built agentic systems using LangGraph." What matters — for scoring, for routing, and for advice — is whether that claim is backed by evidence or is an assertion without proof.

Demonstrated experience has artifacts: a deployed system with a live URL, production metrics, specific failure modes the candidate debugged and resolved, observability tooling mentioned, client outcomes. These things exist in the world and can be verified.

Claimed capability has none of that: skills listed without supporting context, technologies mentioned without a project, general statements like "experience with X" with no specifics.

This distinction matters for two reasons. First, the evidence bar varies between roles. A senior AI agent role expects you have shipped agents in production. A growth-stage role hiring for learning velocity may not. Scoring a claimed bullet the same as a demonstrated one produces advice that doesn't reflect what the role actually requires. Second, demonstrated experience survives an interview. Claimed experience does not. Adding AI terminology to work that has no genuine analogy behind it will be exposed the moment an interviewer asks someone to go deep.

**The five battle card verdict values**

```ts
type BattleCardVerdict =
  | "strong_match"
  | "framing_gap"       // experience exists, described in a way that misses the role signal
  | "terminology_gap"   // skill present but named differently than JD expects
  | "hard_gap"          // candidate genuinely lacks this qualification
  | "evidence_gap"      // candidate listed this but no evidence behind it
```

`evidence_gap` is distinct from `hard_gap`. `hard_gap` means the experience is absent. `evidence_gap` means the experience is claimed but unverifiable. The fix is different: `hard_gap` requires building or finding the experience; `evidence_gap` requires surfacing or creating evidence for work that may actually exist.

**What good advice looks like**

- Identifies which specific bullets are demonstrated vs claimed — naming the actual bullets, not making a general statement
- Scores materially lower when experience is claimed without evidence against a role with a high evidence bar
- Tells the candidate specifically what evidence would make a claimed bullet credible — "a deployed URL and one production metric would change how this reads"
- Never suggests vocabulary swaps on bullets that have no demonstrated evidence behind them
- Uses `evidence_gap` verdict when the claim is unverifiable — not `terminology_gap`, not `hard_gap`

**What failure looks like**

- Treating claimed and demonstrated experience as equivalent in scoring
- Suggesting vocabulary translations on bullets with no evidence behind them — this makes the problem worse
- "Highlight your experience with X" when the experience may only be claimed
- Scoring the same fitScore for a candidate who has shipped something in production and one who has listed the same technology without evidence
- Using `terminology_gap` verdict when `evidence_gap` is the accurate read

---

### Dimension 3 — Vocabulary Gap and Translation Legitimacy

**What it means**

There are two distinct translation problems that look like one. Conflating them produces bad advice.

The first is vocabulary mismatch. The candidate uses different words than the JD for the same capability. "Microservices" on the resume, "distributed systems" in the JD. This is a keyword problem with a keyword fix. ATS catches it. Terminology diffs solve it.

The second is legitimacy. Does the underlying experience actually map to what the JD requires, or is the candidate claiming a translation that won't hold up? This requires genuine judgment about the nature of the work itself — and it has nothing to do with the role archetype. A REST API that transforms data is not an agentic system. That is true regardless of which kind of role is asking. The analogy either holds or it doesn't based on the structural similarity of the work.

A backend engineer whose image selection service made context-aware decisions based on real-time browsing signals has a legitimate analogy to agentic decision-making. The work involved routing logic, competing signal weighting, and output that was a judgment not just a transformation. Calling it a "context-aware decision engine" is honest.

The same engineer who built a REST API that transforms data and calls it "agent orchestration" is vocabulary washing. There is no genuine structural analogy. It will collapse in an interview the moment someone asks them to explain the architecture.

The stress test for any translation: did the system make decisions based on context, or just transform data? Would an engineer in the target domain immediately recognise the analogy? Would the candidate be comfortable going deep on this claim under questioning? If all three are yes — legitimate. If any is no — describe the work accurately and let the fit score reflect the honest gap.

**What good advice looks like**

- Names which specific translations are legitimate and which are forced — not blanket "your experience transfers"
- For legitimate translations: names the specific structural analogy and what to call it
- For forced translations: names why the analogy doesn't hold and what to say instead
- Distinguishes clearly between the vocabulary mismatch problem and the legitimacy problem — they have different fixes
- Never suggests vocabulary for work that has no genuine analogy behind it

**What failure looks like**

- "Your transferable skills include X" without assessing whether the analogy is genuine
- Suggesting vocabulary swaps on work with no structural analogy to the real ask
- Conflating the two translation problems — fixing keywords when legitimacy is the real issue, or flagging vocabulary when the underlying analogy is genuine
- Treating all backend experience as transferable to AI roles — it isn't
- Producing a before/after diff for a mismatch where the underlying analogy doesn't hold

---

### Dimension 4 — What the Recruiter and Hiring Manager Are Actually Looking For

**What it means**

Every job description has a surface layer and a real ask underneath it. The surface layer is the requirements list — years of experience, specific technologies, job title. The real ask is what the company is actually trying to hire for: the specific expensive problem they need solved, the kind of person who can solve it, and the environment they need to thrive in.

These are not the same thing. Two job descriptions can list identical requirements but be asking for completely different things. A `specialist_depth` role is really asking: have you solved this specific problem in production before and can you go deep on it. A `founding_engineer` role is really asking: can you operate without a playbook, make good decisions under uncertainty, and build something from nothing. A `scale_operator` role is really asking: have you operated systems at this scale before and do you have the production war stories to prove it.

The Archetype System surfaces this real ask. It encodes patterns observed across real job postings — each archetype naming what a role of that type is fundamentally trying to hire for, beyond what the requirements list says. This is the only place archetypes affect advice quality. They don't change whether a translation is legitimate. They don't change whether evidence is demonstrated or claimed. They surface the real ask so the advice can be calibrated to two distinct audiences making two distinct judgments.

#### The recruiter's 7-second scan

A recruiter spends roughly 7 seconds on initial review. In those 7 seconds they are not reading — they are scanning for one specific signal that tells them this person has done the job before. That signal is different for every archetype.

A `specialist_depth` recruiter scans for a specific technology or domain name held for multiple years at recognisable companies. A `scale_operator` recruiter scans for a specific scale number — not "high traffic" but actual RPS or user counts. A `founding_engineer` recruiter scans for previous early-stage experience and evidence of ownership. A `growth_hire` recruiter scans for trajectory — what has this person built or learned recently.

Good advice identifies which experience on this resume signals the real ask most clearly, and whether that signal is in the right place to be seen in 7 seconds. Experience that speaks directly to the real ask but is buried in the third bullet of the third role will not be seen. Good advice surfaces it and positions it.

#### The hiring manager's real ask and interview probing

The hiring manager's interview is not a requirements checklist. They are testing whether this candidate can actually deliver on the real ask. Everything they probe is an attempt to answer that one question.

A `specialist_depth` interviewer drills into one specific claimed skill relentlessly — multiple follow-up questions, increasing specificity, until they find the floor of the candidate's knowledge. A `founding_engineer` interviewer tests judgment and temperament — how do you make decisions without a playbook, what would you do in the first 30 days. A `scale_operator` interviewer asks for specific numbers and production incident stories — not "have you worked at scale" but "what broke, how did you find it, what did you change."

The gap between resume depth and conversational depth is real. A candidate can have genuine experience, describe it accurately, and still struggle because they can't access that experience fluently under this specific kind of pressure. Good advice names what's coming before the interview, not after.

**What good advice looks like**

- Identifies which specific experiences on this resume signal the real ask most clearly to the recruiter — and whether they're positioned to be seen in 7 seconds
- Names 1-3 specific topics the hiring manager would probe, based on what the candidate has actually claimed and what this archetype's real ask demands
- For each topic: what was claimed, why this specific role would challenge it, what a strong answer looks like
- Names one specific story the candidate should prepare to tell in depth — from their actual resume, not generic
- Reflects the probing pattern of this specific archetype — not generic interview guidance

**What failure looks like**

- "Prepare for common interview questions" — generic, not actionable
- "Research the company" — baseline, not differentiated
- Interview prep that doesn't connect to anything specific on this resume or in this JD
- Surfacing experience that doesn't speak to the real ask while ignoring experience that does
- Stopping at the resume without addressing the interview layer for confirmed fit candidates
- Advice that would be identical for a different candidate applying to the same role

---

## Banned phrases

These phrases signal generic advice regardless of which dimension they appear in. Their presence in any output is a failure signal.

**Generic encouragement:**
- "highlight your relevant experience"
- "leverage your experience"
- "transferable skills"
- "demonstrate your expertise"
- "results-driven"
- "proven track record" (when used generically)
- "In today's competitive landscape"

**Hedge phrases that soften honest verdicts into uselessness:**
- "while you may not have direct experience"
- "although your background is in"
- "despite not having"
- "you could consider"
- "it may be worth"
- "this role may not be the right fit at this time"

**Generic action items with no specificity:**
- "consider building projects"
- "gain relevant experience"
- "network with professionals in the field"
- "optimize your keywords"
- "prepare for common interview questions"
- "research the company"

**AI-sounding language** — this list was derived from Resume Matcher (open source, 26k GitHub stars), which catalogued the phrases LLMs default to when generating resume content. Their research confirmed that this language is immediately recognisable as AI-generated to hiring managers and signals a lack of authentic voice:

- spearheaded, orchestrated, championed, synergized, revolutionized
- pioneered, catalyzed, operationalized, effectuated, endeavored
- synergy, paradigm shift, best-in-class, world-class, cutting-edge
- game-changing, disruptive, holistic, actionable, impactful
- move the needle, low-hanging fruit, deep dive, circle back
- stakeholder, deliverables, bandwidth, touch base, value-add

---

## How this document evolves

This is a living document. It grows in two directions.

As evals run and outputs are reviewed, new failure modes get added to banned phrases and new rubric anchors get added to dimensions. The document gets more specific over time, not more abstract.

As new archetypes are added to the Archetype System, archetype-specific rubric anchors for dimension 4 are added here — what the real ask is for each archetype, which experiences to surface, and what the interviewer will probe for. The Archetype System PRD describes what archetypes are and how they're detected. This document describes how they change what good advice looks like.