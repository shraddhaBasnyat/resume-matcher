# User Profiles & Journeys

Each scenario maps to a distinct user in a distinct emotional state. Prompt copy and eval criteria should be calibrated to these profiles — not just to output field correctness.

Scenarios are derived from two signals only: `fitScore` and `atsScore`. No other routing inputs.

The ATS panel and fit analysis are always surfaced together but answer different questions. The ATS panel is the recruiter's view — mechanical, literal, searchable. The fit analysis is the hiring manager's view — inferential, narrative, human. They are designed to diverge. A user's problem lives in one panel or the other, rarely both equally.

---

## Scenario 1 — The Confirmed Fit
**fitScore >= 75, atsScore >= 75**

**Who they are:** A candidate who genuinely matches the role and has a well-structured, keyword-rich resume that surfaces correctly to automated filters. They've done the work. They just want confirmation.

**What they're feeling:** Hopeful and looking for validation. They believe they are qualified and want the tool to confirm they aren't second-guessing themselves unnecessarily.

**What success looks like:** They close the tool feeling energised and ready to apply without hesitation. The system confirmed the fit and didn't manufacture useless advice just to fill space. Sparse output is correct output here — padding erodes trust.

**ATS panel role:** All three stations are green. Show it clearly. The panel's job in this scenario is to confirm there's nothing to fix, not to find problems. Station 3 will show no terminology mismatches — `terminologyDiffs` is empty, and that is the correct, complete result.

**Fit analysis role:** Confirms the human match with specific strengths named from the actual resume. No generic encouragement. Brief is right.

---

## Scenario 2 — The Invisible Expert
**fitScore >= 75, atsScore < 75**

**Who they are:** A highly qualified candidate who perfectly matches the job's requirements but has no idea that their resume layout or terminology choices make them completely invisible to automated filters. They keep not getting interviews despite knowing they are the right person for the role.

**What they're feeling:** Frustrated and bewildered. They know they are qualified but aren't getting traction, and they are starting to doubt their actual skills rather than their resume presentation.

**What success looks like:** A massive sense of relief. They realise the problem isn't their talent — it's a simple translation issue between how they describe their work and how the machine reads it. They close the tool knowing exactly which terminology swaps will make them visible. The insight is: the work is right, the words are wrong.

**ATS panel role:** This is the scenario where the ATS panel does its most important work. Station 3 surfaces `terminologyDiffs` as inline before/after diffs on the candidate's own sentences — no user prompt required. The moment they see their own bullet rewritten with one word changed, the confusion lifts. The panel is the product for this user.

**Fit analysis role:** Confirms clearly that the qualification is real and strong. This is load-bearing for the emotional arc — the candidate needs to hear "you match this role" before the ATS panel's explanation of why they're invisible lands as relief rather than another rejection. The fit analysis sets the frame; the ATS panel delivers the fix.

**Critical:** The fit analysis must not restate the terminology gaps. That duplication undercuts the panel's impact. The fit analysis speaks to the human match. The ATS panel speaks to the mechanical fix. They are separate voices.

---

## Scenario 3 — The Narrative Gap
**fitScore 50–74, atsScore any**

**Who they are:** A professional whose career trajectory and transferable skills fit the role well, but whose resume reads as a literal history of past job titles rather than a narrative pointing toward a future role. They have the experience — it's just not framed to show it.

**What they're feeling:** Anxious and slightly insecure. They worry that because they haven't held this exact title before, no one will take them seriously. They feel like an imposter even though the underlying skills are there.

**What success looks like:** They feel seen and understood on a deeper level. Success is not telling them to go learn new skills — it's the moment they realise they already have the experience. They close the tool knowing exactly how to reframe their existing story to fit the target role's narrative. The insight is: the experience is right, the framing is wrong.

**ATS panel role:** The ATS panel may be entirely clean for this scenario — `atsScore` can be high even when `fitScore` is mid-range. If the panel is clean, show it clearly and briefly: "Your resume is readable and surfaces in search. The gap is not mechanical." This is important context — it tells the user the problem isn't keywords or formatting, which is information. If the panel has issues, surface them normally, but they are secondary to the fit analysis in this scenario.

**Fit analysis role:** This node owns this scenario entirely. The transferable strengths and reframing suggestions must be specific to this candidate's actual experience — not generic career pivot advice. The specificity test applies with full force here: could this reframing suggestion have been written without reading this specific resume? If yes, it fails.

---

## Scenario 4 — The Honest Verdict
**fitScore < 50, atsScore any**

**Who they are:** A candidate whose confidence may not be grounded in the evidence. The gap is real — either the skills aren't there yet, the experience is too far removed, or the transition requires deliberate work they haven't started. HITL gives them one opportunity to surface context their resume missed — if they can provide it, the score may move and they land in a different scenario. If not, the verdict stands.

**What they're feeling:** Defensive initially, then potentially deflated. They came in confident and are getting a verdict they didn't expect. If HITL fired, they've already tried to explain themselves once — tone must stay collaborative, not skeptical.

**What success looks like:** They feel respected even though the answer may be no. The tool doesn't manufacture false hope or pad the result with motivational language. The `weakMatchReason` is direct and specific — not cruel, not generic, but honest in a way that a trusted mentor would be. They close the session knowing clearly why the gap exists and what it would actually take to close it. Clarity over comfort.

**ATS panel role:** Secondary in this scenario. The gap is in the fit score, not the ATS score. Surface the ATS panel normally — if there are formatting or terminology issues, show them. But the panel does not soften or complicate the honest verdict. "Your terminology mismatches are fixable, but the core experience gap remains" is a valid combined read. The panel findings don't change the verdict node's job.

**HITL note:** HITL fires once maximum per run. If the rescore moves `fitScore` above 50, the user lands in Narrative Gap or Confirmed Fit instead. If the score stays below 50 after HITL, the Honest Verdict stands. `hitlFired` prevents a second interrupt.

---

## Paid tier enrichment

The four scenarios above are the base product. On the paid tier, two context layers can enrich the advice without changing the routing:

**Archetype context** — when a known career transition is detected (e.g. backend SWE → AI agent dev), the verdict node prompt is enriched with transition-specific data: hidden strengths, credibility signals, mental model shift. The scenario doesn't change — the advice gets more specific.

**Intent context** — when the user declares their intent and current status (e.g. `exploring_gap` + `one_year_plus` + `starting_from_scratch`), the verdict node prompt is calibrated to their declared situation. Base tier always defaults to `confident_match` + `direct_experience`.

Neither enrichment changes which scenario the user is in. They change how specifically the verdict node speaks to that user's situation.

---

## Tone principles across all scenarios

**Never manufacture advice.** Empty `fitAdvice` on a strong match is correct. Padding to appear thorough erodes trust faster than saying nothing. This applies to both the fit analysis and the ATS panel — if Station 3 has no terminology mismatches, `terminologyDiffs` is empty, and that is shown as a clean result, not padded with generic keyword advice.

**Honesty over comfort, but never cruelty.** Scenario 4 especially. The tool is a trusted mentor, not a rejection machine.

**Specificity is the product.** Generic advice — "strengthen your experience section," "highlight your skills" — is the failure mode in every scenario. The test for any output: could this have been written without reading this specific resume and this specific job description? If yes, it's generic. This test applies independently to the fit analysis output and to the ATS panel output — they have different failure modes and must each pass the specificity test on their own terms.

**The ATS panel and fit analysis are separate voices.** They do not restate each other. The fit analysis does not mention keyword gaps. The ATS panel does not speculate about career narrative or human judgment. Overlap between the two panels is a signal that one of them is doing the other's job.

**The user's emotional state is the context.** The same information lands differently depending on whether the user feels seen or dismissed. Tone is not decoration — it is part of the output quality.

**ATS advice is the mechanical layer, not a secondary report.** The three-station ATS panel is a full, complete product feature, not a footnote to the fit analysis. For the Invisible Expert, it is the primary output. Surface it with the same care as the fit analysis, not as an afterthought.