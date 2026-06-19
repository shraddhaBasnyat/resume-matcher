import { z } from "zod";

export const RoleArchetype = z.enum([
  "specialist_depth",
  "modernisation_refactor",
  "greenfield_builder",
  "founding_engineer",
  "scale_operator",
  "growth_hire",
]);

export const AnalyzeJDLLMSchema = z.object({
  jdArchetype: z.object({
    ideal: RoleArchetype.describe(
      "The archetype the company would hire if they found a perfect match. " +
      "Derived from the real ask beneath the requirements list.",
    ),
    couldWork: z.array(RoleArchetype).max(2).describe(
      "Archetypes the company will realistically consider given market availability. " +
      "Maximum two. Empty array is valid. Each entry must differ from ideal.",
    ),
  }),
  realAsk: z.string().min(1).describe(
    "The specific problem this company is hiring to solve — not a generic archetype description. " +
    "Instantiate the archetype pattern against this specific JD.",
  ),
  recruiterFilter: z.string().min(1).describe(
    "The mechanical Boolean-style filter a recruiter would run — specific terms and phrases, " +
    "not generic categories. What gets a resume seen on the first pass.",
  ),
});

export type AnalyzeJDLLMOutput = z.infer<typeof AnalyzeJDLLMSchema>;
