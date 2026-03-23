import { StateGraph, interrupt, MemorySaver } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { GraphState, type GraphStateType } from "./graph-state";
import { buildResumeChain } from "./resume-chain";
import { JobSchema } from "./job-schema";
import { MatchSchema } from "./match-schema";

// ---------------------------------------------------------------------------
// Job chain (same pattern as buildResumeChain)
// ---------------------------------------------------------------------------

const JOB_SYSTEM_PROMPT = `You are an expert job description parser. Extract structured information from the job description text.

Follow these rules:
- Extract required skills as individual atomic items (e.g. "React", "Python").
- Extract nice-to-have skills separately from required skills.
- Extract important technical and domain keywords for matching.
- Estimate required years of experience from the text; omit if not mentioned.
- Infer seniority level from titles and expectations (junior/mid/senior/lead/manager); omit if unclear.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildJobChain(model: any) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", JOB_SYSTEM_PROMPT],
    ["human", "Parse the following job description and extract the structured data:\n\n{job_text}"],
  ]);

  const structuredModel = model.withStructuredOutput(JobSchema);

  return {
    invoke: async (input: { job_text: string }) => {
      const messages = await prompt.invoke(input);
      return structuredModel.invoke(messages, { runName: "parse-job" });
    },
  };
}

// ---------------------------------------------------------------------------
// Scoring chain
// ---------------------------------------------------------------------------

const SCORING_SYSTEM_PROMPT = `You are a resume-to-job-description matcher. Score the candidate's fit for the role from 0 to 100.

Rules:
- matchedSkills: skills the candidate has that appear in requiredSkills or niceToHaveSkills.
- missingSkills: skills in requiredSkills that the candidate lacks.
- narrativeAlignment: one paragraph on how the candidate's career story aligns with this role.
- gaps: specific mismatches in experience level, domain, or skills.
- resumeAdvice: 3-5 actionable suggestions to strengthen the resume for this role.
- weakMatch: true if score < 60.
- weakMatchReason: required when weakMatch is true — explain specifically what is missing.
- If humanContext is provided, weigh it alongside the resume when scoring.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildScoringChain(model: any) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SCORING_SYSTEM_PROMPT],
    [
      "human",
      `Resume Data:
{resume_data}

Job Description Data:
{job_data}

Additional Context from Candidate:
{human_context}

Score this candidate's fit for the role.`,
    ],
  ]);

  const structuredModel = model.withStructuredOutput(MatchSchema);

  return {
    invoke: async (
      input: { resume_data: string; job_data: string; human_context: string },
      config?: { runName?: string }
    ) => {
      const messages = await prompt.invoke(input);
      return structuredModel.invoke(messages, config ?? {});
    },
  };
}

// ---------------------------------------------------------------------------
// Gap analysis chain
// ---------------------------------------------------------------------------

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a senior career coach who specialises in resume tailoring.
Given a match result between a resume and a job description, produce specific, actionable resume advice.
Each item in resumeAdvice should name a concrete section or bullet point change, not general guidance.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildGapAnalysisChain(model: any) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", GAP_ANALYSIS_SYSTEM_PROMPT],
    [
      "human",
      `Match Result:
{match_result}

Provide specific advice for how the candidate should rewrite sections of their resume to better match this job.
Return the same match result with resumeAdvice updated to contain the new, more targeted suggestions.`,
    ],
  ]);

  const structuredModel = model.withStructuredOutput(MatchSchema);

  return {
    invoke: async (input: { match_result: string }) => {
      const messages = await prompt.invoke(input);
      return structuredModel.invoke(messages, { runName: "gap-analysis" });
    },
  };
}

// ---------------------------------------------------------------------------
// Graph factory
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildScoringGraph(model: any) {
  const resumeChain = buildResumeChain(model);
  const jobChain = buildJobChain(model);
  const scoringChain = buildScoringChain(model);
  const gapChain = buildGapAnalysisChain(model);

  // Node 1: parse resume
  async function parseResume(state: GraphStateType) {
    const resumeData = await resumeChain.invoke({ resume_text: state.resumeText });
    return { resumeData };
  }

  // Node 2: parse job description
  async function parseJob(state: GraphStateType) {
    const jobData = await jobChain.invoke({ job_text: state.jobText });
    return { jobData };
  }

  // Node 3: score the match (also used as rescore)
  async function scoreMatch(state: GraphStateType) {
    if (!state.resumeData) {
      throw new Error("scoreMatch: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("scoreMatch: jobData is missing from graph state");
    }
    const runName = state.humanContext?.trim() ? "rescore-with-context" : "score-match";
    const matchResult = await scoringChain.invoke(
      {
        resume_data: JSON.stringify(state.resumeData, null, 2),
        job_data: JSON.stringify(state.jobData, null, 2),
        human_context: state.humanContext,
      },
      { runName }
    );
    return { matchResult };
  }

  // Interrupt node: pause and wait for human context
  async function awaitHuman(_state: GraphStateType) {
    const humanContext = interrupt(
      "Score is below 60. Please provide additional context about your experience that your resume does not show."
    );
    return { humanContext: humanContext as string };
  }

  // Conditional edge after awaitHuman: if context provided → rescore, else → gapAnalysis
  function routeAfterHuman(state: GraphStateType): "rescore" | "gapAnalysis" {
    return state.humanContext && state.humanContext.trim().length > 0 ? "rescore" : "gapAnalysis";
  }

  // Conditional edge after scoreMatch
  function routeAfterScore(state: GraphStateType): "gapAnalysis" | "awaitHuman" {
    return (state.matchResult?.score ?? 0) >= 60 ? "gapAnalysis" : "awaitHuman";
  }

  // Node 4: gap analysis — enriches resumeAdvice in the existing matchResult
  async function gapAnalysis(state: GraphStateType) {
    const updated = await gapChain.invoke({
      match_result: JSON.stringify(state.matchResult, null, 2),
    });
    return { matchResult: updated };
  }

  const workflow = new StateGraph(GraphState)
    .addNode("parseResume", parseResume)
    .addNode("parseJob", parseJob)
    .addNode("scoreMatch", scoreMatch)
    .addNode("awaitHuman", awaitHuman)
    .addNode("rescore", scoreMatch) // same logic, humanContext already in state
    .addNode("gapAnalysis", gapAnalysis)
    .addEdge("__start__", "parseResume")
    .addEdge("__start__", "parseJob")
    .addEdge("parseResume", "scoreMatch")
    .addEdge("parseJob", "scoreMatch")
    .addConditionalEdges("scoreMatch", routeAfterScore, {
      gapAnalysis: "gapAnalysis",
      awaitHuman: "awaitHuman",
    })
    .addConditionalEdges("awaitHuman", routeAfterHuman, {
      rescore: "rescore",
      gapAnalysis: "gapAnalysis",
    })
    .addEdge("rescore", "gapAnalysis")
    .addEdge("gapAnalysis", "__end__");

  // TODO: Replace MemorySaver with a durable checkpointer (e.g., Redis/DB-backed)
  // to support HITL across server restarts, cold starts, and multi-instance deployments.
  const checkpointer = new MemorySaver();
  return workflow.compile({ checkpointer });
}
