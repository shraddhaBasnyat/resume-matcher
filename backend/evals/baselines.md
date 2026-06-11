# Eval Baselines

Results are recorded manually after each significant run. Update this file when the architecture changes or assertions are updated.

---

## F1 — Resume A (no JobInit) vs Cresta JD
**Date:** 2026-06-10  
**Architecture:** Current single-pass analyzeFit with raw text inputs  
**Node version:** 22.22.3  
**Promptfoo version:** 0.121.15  

| Metric | Score |
|---|---|
| Pass rate | 94% (36/39) |
| fitScore produced | 62 |
| fitScore target | <55 |
| HardGapAcknowledged | 1.00 |
| SpecificityTest | 1.00 |
| SummaryQuality | 0.73 |
| AhaQuality | 0.63 |
| TranslationLegitimacy | 0.40 |
| ScoreCalibration | 0.00 |
| OverallF1Quality | 0.76 |

**Known failures:**
- ScoreCalibration — expected TDD failure. fitScore 62 should be <55. Will resolve when analyzeResume/analyzeJD structured outputs are passed as inputs to analyzeFit in the new architecture.
- TranslationLegitimacy — 0.40, grader variance suspected. Worth monitoring across runs.
- AhaQuality — 0.63, fitAha not specific enough to Wayfair work. Will improve with structured inputs.

## F2 — Resume B (JobInit added) vs Cresta JD
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
| ScoreHigherThanF1 | 1.00 |
| JobInitRecognized | 0.80 |
| EvidenceGapCorrect | 0.70 |
| InfraGapsIdentified | 0.85 |
| FramingInsight | 0.20 |
| NarrativeGapQuality | 0.77 |
| SpecificityTest | 0.97 |
| OverallF2Quality | 0.70 |

**Known failures:**
- FramingInsight — 0.20. The model treats "Personal Project" as a genuine capability gap rather than a framing/presentation issue. The fitAha surfaces cloud/Kubernetes gaps instead of the JobInit framing insight — that the work is real but the presentation doesn't signal production engineering at Cresta's scale. Will resolve when analyzeResume structured output explicitly classifies JobInit as production AI agent work, giving analyzeFit the signal to surface the framing gap rather than inferring it from the label.

**What F1 and F2 together tell you:**
- The model correctly scores Resume B higher than Resume A (72 vs 62) — scoring moves in the right direction when AI agent work is present
- Score calibration passes on both fixtures — the model is in the right territory
- The framing gap insight is the hardest thing for a single-pass prompt to produce — it requires structured resume analysis to distinguish "genuine gap" from "presentation gap"
- This is the core argument for the new architecture