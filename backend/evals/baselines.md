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