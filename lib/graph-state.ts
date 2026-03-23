import { Annotation } from "@langchain/langgraph";
import type { Resume } from "./schemas";
import type { JobDescription } from "./job-schema";
import type { MatchResult } from "./match-schema";

export const GraphState = Annotation.Root({
  // Raw text inputs — transient for the life of the graph run only.
  // Never included in API responses.
  resumeText: Annotation<string>(),
  jobText: Annotation<string>(),
  humanContext: Annotation<string>({
    default: () => "",
    reducer: (_prev, next) => next,
  }),
  // Structured outputs written by each parse node
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
  // LangGraph thread ID — for HITL resume
  threadId: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (_prev, next) => next,
  }),
});

export type GraphStateType = typeof GraphState.State;
