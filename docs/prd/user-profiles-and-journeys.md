# User Profiles & Journeys

Each scenario has a distinct user in a distinct emotional state. Prompt copy and eval criteria should be calibrated to these profiles — not just to output field correctness.

---

## Scenario 1a — The Validated Applicant
**Strong fit, ATS ready**

**Who they are:** A candidate who genuinely matches the role and has a well-structured, keyword-rich resume that surfaces correctly to automated filters. They've done the work. They just want confirmation.

**What they're feeling:** Hopeful and looking for validation. They believe they are qualified and want the tool to confirm they aren't second-guessing themselves unnecessarily.

**What success looks like:** They close the tool feeling energised and ready to apply without hesitation. The system confirmed the fit and didn't manufacture useless advice just to fill space. Sparse output is correct output here — padding erodes trust.

---

## Scenario 1b — The Invisible Expert
**Strong fit, ATS exposure**

**Who they are:** A highly qualified candidate who perfectly matches the job's requirements but has no idea that their resume layout or terminology choices make them completely invisible to automated filters. They keep not getting interviews despite knowing they are the right person for the role.

**What they're feeling:** Frustrated and bewildered. They know they are qualified but aren't getting traction, and they are starting to doubt their actual skills rather than their resume presentation.

**What success looks like:** A massive sense of relief. They realise the problem isn't their talent — it's a simple translation issue between how they describe their work and how the machine reads it. They close the tool knowing exactly which terminology swaps will make them visible. The insight is: the work is right, the words are wrong.

---

## Scenario 2 — The Narrative Gap
**Fits the work, wrong frame**

**Who they are:** A professional whose career trajectory and transferable skills fit the role well, but whose resume reads as a literal history of past job titles rather than a narrative pointing toward a future role. They have the experience — it's just not framed to show it.

**What they're feeling:** Anxious and slightly insecure. They worry that because they haven't held this exact title before, no one will take them seriously. They feel like an imposter even though the underlying skills are there.

**What success looks like:** They feel seen and understood on a deeper level. Success is not telling them to go learn new skills — it's the moment they realise they already have the experience. They close the tool knowing exactly how to reframe their existing story to fit the target role's narrative. The insight is: the experience is right, the framing is wrong.

---

## Scenario 3 — The Archetype Pivot
**Fits a known transition, paid tier**

**Who they are:** A backend engineer who has been applying to AI agent developer roles and keeps getting rejected or ignored without understanding why, despite having years of production experience building reliable systems.

**What they're feeling:** Confused and slightly defensive. They know they are highly skilled but are frustrated that their traditional engineering background doesn't seem to translate to recruiters looking specifically for AI talent. They feel their credibility is being dismissed.

**What success looks like:** They feel seen rather than rejected. The tool surfaces what they already have that directly transfers — building APIs is designing tool schemas, debugging distributed systems is debugging non-deterministic agents, testing culture maps directly to eval culture. They close the tool knowing exactly how to reframe their deterministic background to prove they understand probabilistic systems, and knowing which specific gaps (eval methodology, production agent shipping) are the ones to close first.

---

## Scenario 4a — The Misread Candidate
**Weak fit on paper, HITL resolves in their favour**

**Who they are:** A candidate who genuinely has relevant experience that their resume fails to convey. The low score is a framing problem, not a fit problem. HITL gives them the chance to surface what the resume missed.

**What they're feeling:** Anxious and eager to defend themselves. When they see a low score they feel misunderstood — not wrong, misread. They want to explain themselves immediately.

**What success looks like:** They feel heard. The HITL interaction gives them a specific prompt — not "tell us more" generically but "you mentioned X, we need to know A and B specifically." They provide the missing context, the score moves, and they close the session knowing exactly what to add to their resume so they don't have to explain it next time.

---

## Scenario 4b — The Skeptical Follow-up Moment
**Post-HITL, model still not convinced**

This is a specific interaction within Scenario 4 that deserves its own tone note. The user has already gone through HITL once, provided context, and the model is still asking for more specificity.

**What they're feeling:** A mix of determination and mild frustration. They've already tried to explain themselves once. Being asked again could feel like the tool doesn't believe them.

**What success looks like:** The `contextPrompt` in this moment must feel collaborative, not skeptical. Not "we're not convinced" but "you're close — here's the specific thing that would complete the picture." The user should feel like the tool is on their side trying to find the evidence, not acting as a gatekeeper looking for reasons to reject them. This is the most tonally sensitive output in the entire product.

---

## Scenario 5 — The Honest Verdict
**Genuine weak match, confident_match intent**

**Who they are:** A candidate whose confidence isn't grounded in the evidence. They believe they are a strong match but the gap is real — either the skills aren't there yet, or the experience is too far removed, or the transition requires years of deliberate work they haven't started.

**What they're feeling:** Defensive initially, then potentially deflated. They came in confident and are getting a verdict they didn't expect.

**What success looks like:** They feel respected even though the answer is no. The tool doesn't manufacture false hope or pad the result with motivational language. The `weakMatchReason` is direct and specific — not cruel, not generic, but honest in a way that a trusted mentor would be. They close the session knowing clearly why the gap exists and what it would actually take to close it, even if that timeline is long. Clarity over comfort.

---

## Scenario 6 — The Long-Term Planner
**Exploring gap intent, any fit score**

**Who they are:** A professional who has accepted the gap and wants a map. This includes both candidates making a known archetype transition (backend SWE → AI agent dev) and those making transitions outside any registered archetype. The `exploring_gap` intent covers both — the archetype just determines whether the roadmap is specific or generic.

**What they're feeling:** Resigned to the current gap but hopeful about the future. They are not expecting a high score today — just honest direction. They came for the roadmap, not the verdict.

**What success looks like:** They feel motivated rather than overwhelmed. They close the tool with a clear, prioritised list of what to build toward and in what order — calibrated to their declared timeline and current status. A `one_year_plus` + `starting_from_scratch` user needs milestones. An `applying_now` + `side_projects` + `self_taught` user needs immediate actionable gaps. The roadmap should feel like it was written for their specific situation, not copied from a generic career guide.

---

## Tone principles across all scenarios

**Never manufacture advice.** Empty `resumeAdvice` on a strong match is correct. Padding to appear thorough erodes trust faster than saying nothing.

**Honesty over comfort, but never cruelty.** Scenario 5 especially. The tool is a trusted mentor, not a rejection machine.

**Specificity is the product.** Generic advice — "strengthen your experience section," "highlight your skills" — is the failure mode in every scenario. The test for any output: could this have been written without reading this specific resume and this specific job description? If yes, it's generic.

**The user's emotional state is the context.** The same information lands differently depending on whether the user feels seen or dismissed. Tone is not decoration — it is part of the output quality.