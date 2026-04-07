# User Profiles & Journeys

Each scenario maps to a distinct user in a distinct emotional state. Prompt copy and eval criteria should be calibrated to these profiles — not just to output field correctness.

Scenarios are derived from two signals only: `fitScore` and `atsScore`. No other routing inputs.

---

## Scenario 1 — The Confirmed Fit
**fitScore >= 75, atsScore >= 75**

**Who they are:** A candidate who genuinely matches the role and has a well-structured, keyword-rich resume that surfaces correctly to automated filters. They've done the work. They just want confirmation.

**What they're feeling:** Hopeful and looking for validation. They believe they are qualified and want the tool to confirm they aren't second-guessing themselves unnecessarily.

**What success looks like:** They close the tool feeling energised and ready to apply without hesitation. The system confirmed the fit and didn't manufacture useless advice just to fill space. Sparse output is correct output here — padding erodes trust.

---

## Scenario 2 — The Invisible Expert
**fitScore >= 75, atsScore < 75**

**Who they are:** A highly qualified candidate who perfectly matches the job's requirements but has no idea that their resume layout or terminology choices make them completely invisible to automated filters. They keep not getting interviews despite knowing they are the right person for the role.

**What they're feeling:** Frustrated and bewildered. They know they are qualified but aren't getting traction, and they are starting to doubt their actual skills rather than their resume presentation.

**What success looks like:** A massive sense of relief. They realise the problem isn't their talent — it's a simple translation issue between how they describe their work and how the machine reads it. They close the tool knowing exactly which terminology swaps will make them visible. The insight is: the work is right, the words are wrong.

---

## Scenario 3 — The Narrative Gap
**fitScore 50–74, atsScore any**

**Who they are:** A professional whose career trajectory and transferable skills fit the role well, but whose resume reads as a literal history of past job titles rather than a narrative pointing toward a future role. They have the experience — it's just not framed to show it.

**What they're feeling:** Anxious and slightly insecure. They worry that because they haven't held this exact title before, no one will take them seriously. They feel like an imposter even though the underlying skills are there.

**What success looks like:** They feel seen and understood on a deeper level. Success is not telling them to go learn new skills — it's the moment they realise they already have the experience. They close the tool knowing exactly how to reframe their existing story to fit the target role's narrative. The insight is: the experience is right, the framing is wrong.

---

## Scenario 4 — The Honest Verdict
**fitScore < 50, atsScore any**

**Who they are:** A candidate whose confidence may not be grounded in the evidence. The gap is real — either the skills aren't there yet, the experience is too far removed, or the transition requires deliberate work they haven't started. HITL gives them one opportunity to surface context their resume missed — if they can provide it, the score may move and they land in a different scenario. If not, the verdict stands.

**What they're feeling:** Defensive initially, then potentially deflated. They came in confident and are getting a verdict they didn't expect. If HITL fired, they've already tried to explain themselves once — tone must stay collaborative, not skeptical.

**What success looks like:** They feel respected even though the answer may be no. The tool doesn't manufacture false hope or pad the result with motivational language. The `weakMatchReason` is direct and specific — not cruel, not generic, but honest in a way that a trusted mentor would be. They close the session knowing clearly why the gap exists and what it would actually take to close it. Clarity over comfort.

**HITL note:** HITL fires once maximum per run. If the rescore moves `fitScore` above 50, the user lands in Narrative Gap or Confirmed Fit instead. If the score stays below 50 after HITL, the Honest Verdict stands. `hitlFired` prevents a second interrupt.

---

## Paid tier enrichment

The four scenarios above are the base product. On the paid tier, two context layers can enrich the advice without changing the routing:

**Archetype context** — when a known career transition is detected (e.g. backend SWE → AI agent dev), the verdict node prompt is enriched with transition-specific data: hidden strengths, credibility signals, mental model shift. The scenario doesn't change — the advice gets more specific.

**Intent context** — when the user declares their intent and current status (e.g. `exploring_gap` + `one_year_plus` + `starting_from_scratch`), the verdict node prompt is calibrated to their declared situation. Base tier always defaults to `confident_match` + `direct_experience`.

Neither enrichment changes which scenario the user is in. They change how specifically the verdict node speaks to that user's situation.

---

## Tone principles across all scenarios

**Never manufacture advice.** Empty `resumeAdvice` on a strong match is correct. Padding to appear thorough erodes trust faster than saying nothing.

**Honesty over comfort, but never cruelty.** Scenario The Honest Verdict especially. The tool is a trusted mentor, not a rejection machine.

**Specificity is the product.** Generic advice — "strengthen your experience section," "highlight your skills" — is the failure mode in every scenario. The test for any output: could this have been written without reading this specific resume and this specific job description? If yes, it's generic.

**The user's emotional state is the context.** The same information lands differently depending on whether the user feels seen or dismissed. Tone is not decoration — it is part of the output quality.

**ATS advice is secondary context, not the main event.** When `atsScore < 75`, the ATS reality check surfaces alongside the fit verdict. It should feel like a supporting insight — "also, here's why you may be invisible to filters" — not a separate report competing for attention.