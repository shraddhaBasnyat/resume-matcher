import { Annotation } from "@langchain/langgraph";
import type { Resume } from "./schemas";
import type { JobDescription } from "./job-schema";
import type { MatchResult } from "./match-schema";

export const GraphState = Annotation.Root({
  resumeText: Annotation<string>(),
  jobText: Annotation<string>(),
  humanContext: Annotation<string>({
    default: () => "",
    reducer: (_prev, next) => next,
  }),
  resumeData: Annotation<Resume | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  jobData: Annotation<JobDescription | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
  matchResult: Annotation<MatchResult | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
});

export type GraphStateType = typeof GraphState.State;
