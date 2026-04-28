# Product Phases

---

## Phase 1 — Do the two signals reflect reality independently?

**Question this phase answers:** Are `fitScore` and `atsScore` independently meaningful — each pointing at a distinct, real problem — or do they blur together into one undifferentiated verdict?

**What this phase validates:**

The fit score and ATS score must be independently meaningful. Run the same resume against real job postings and check that the two scores can diverge in both directions:

- A strong fit with a weak ATS score (invisible expert) — terminology gaps and formatting issues visible in the ATS panel, strong career match visible in the fit analysis. The ATS panel shows the problem; the fit analysis confirms the qualification.
- A weak fit with a clean ATS score (narrative gap or honest verdict) — ATS panel is green across all three layers, fit analysis identifies the real gap. Nothing in the ATS panel is the problem.

**Three-layer ATS validation:** Each layer must produce independently useful output, not just a composite score.

- Layer 1 (machine parsing): formatting flags must be specific and accurate — not generic warnings. Test with a resume that has a two-column layout, inconsistent dates, and non-standard bullets. The flags should name the problem precisely.
- Layer 2 (knockout questions): questions must be inferred correctly from JD language. Verify that "minimum 3 years required" produces a years-of-experience knockout question, not a generic filter. Verify the three-state verdict (pass / at_risk / unknown) is honest — the system should say "cannot determine" rather than guessing on work authorization.
- Layer 3 (recruiter search): the Boolean query must reflect how a recruiter for this specific role would actually search. Test against a real AI agent dev posting — the query should include role-specific terms like LangGraph, RAG, agentic systems, not generic software engineering terms.

**Terminology diffs validation:** `generateTerminologyFixes` must produce diffs on real resume sentences, not invented examples. The before sentence must be findable verbatim in the input resume. The after sentence must change only the flagged term and nothing else.

**Done when:** Run own resume against real AI agent dev job postings (Cresta, Superblocks, NYT, LaunchDarkly, Applied Intuition). Both scores are independently meaningful. The right scenario fires for the right situation. All three ATS layers produce specific, non-generic output. Terminology diffs are accurate and surgical. Validated across at least 4 real job postings.

---

## Phase 2 — Does the analysis feel specific?

**Question this phase answers:** Does the output tell this candidate something specific about their situation, or does it produce advice that could apply to anyone?

**Specificity test:** Could this output have been written without reading this specific resume and this specific job description? If yes, it fails. Apply this test independently to the fit analysis and to the ATS panel — they have different failure modes.

- Fit analysis failure mode: generic career advice ("highlight your relevant experience," "emphasize transferable skills") that doesn't name specific roles, specific gaps, or specific strengths from the actual resume.
- ATS panel failure mode: generic keyword lists that any resume optimizer would produce, rather than terminology mismatches specific to how this candidate describes their work vs. how this JD is written.

**Terminology diffs upgrade:** Phase 2 is where programmatic Layer 1 analysis (actual PDF/DOCX file parsing) replaces LLM-inferred formatting flags. The LLM inferring "possible two-column layout" from text artifacts is acceptable for Phase 1. Detecting it reliably from the file itself is the Phase 2 standard.

**Done when:** Run own resume against a real AI agent dev posting and produce output you would act on — specific bullet points, specific keywords, specific gaps named from real research. At least 2 of 3 soft beta users confirm the output feels specific to their situation, not generic.

**Soft beta profiles to recruit:**
- Someone who just started learning LangGraph — no shipped projects yet
- Someone who has shipped one agent project, not yet job searching
- Someone actively interviewing for AI agent dev roles

---

## Phase 3 — Does it work with real users?

**Question this phase answers:** Is the output useful enough in practice that someone would share it or come back?

**Done when:** Beta users who found the tool on their own complete a run and the output is useful enough they share it, act on it, or come back for another run.