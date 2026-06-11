# Eval Baselines

Results are recorded manually after each significant run. Update this file when the architecture changes or assertions are updated.

---

## resume-a-cresta (Resume A vs Cresta JD)
**Date:** 2026-06-11  
**Architecture:** Current single-pass analyzeFit with raw text inputs  
**Node version:** 22.22.3  
**Promptfoo version:** 0.121.15  

| Metric | Score |
|---|---|
| Pass rate | 95% (37/39) |
| fitScore produced | 62 |
| fitScore target | <55 |
| HardGapAcknowledged | 1.00 |
| SpecificityTest | 1.00 |
| SummaryQuality | 0.78 |
| AhaQuality | 0.60 |
| TranslationLegitimacy | 0.75 |
| ScoreCalibration | 0.00 |
| OverallF1Quality | 0.76 |

**Known failures:**
- ScoreCalibration — expected TDD failure. fitScore 62 should be <55. Will resolve when analyzeResume/analyzeJD structured outputs are passed as inputs to analyzeFit in the new architecture.
- AhaQuality — 0.60, fitAha not specific enough to Wayfair work. Will improve with structured inputs.

---

## resume-b-cresta (Resume B vs Cresta JD)
**Date:** 2026-06-11  
**Architecture:** Current single-pass analyzeFit with raw text inputs  
**Node version:** 22.22.3  
**Promptfoo version:** 0.121.15  

| Metric | Score |
|---|---|
| Pass rate | 96% (40/41) |
| fitScore produced | 72 |
| fitScore target | 65–78 |
| ScoreCalibration | 1.00 |
| JobInitRecognized | 0.80 |
| EvidenceGapCorrect | 0.70 |
| InfraGapsIdentified | 0.85 |
| FramingInsight | 0.20 |
| NarrativeGapQuality | 0.77 |
| SpecificityTest | 0.97 |
| OverallF2Quality | 0.70 |

**Known failures:**
- FramingInsight — 0.20. The model treats "Personal Project" as a genuine capability gap rather than a framing/presentation issue. The fitAha surfaces cloud/Kubernetes gaps instead of the JobInit framing insight — that the work is real but the presentation doesn't signal production engineering at Cresta's scale. Will resolve when analyzeResume structured output explicitly classifies JobInit as production AI agent work, giving analyzeFit the signal to surface the framing gap rather than inferring it from the label.

---

## What the baselines together tell you
- The model correctly scores Resume B higher than Resume A (72 vs 62) — scoring moves in the right direction when AI agent work is present
- ScoreCalibration passes on Resume B, fails on Resume A — the model correctly places Resume B in narrative_gap territory but overshoots Resume A into narrative_gap when it should be honest_verdict
- The framing gap insight is the hardest thing for a single-pass prompt to produce — it requires structured resume analysis to distinguish "genuine gap" from "presentation gap"
- This is the core argument for the new architecture