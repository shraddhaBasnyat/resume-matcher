import { StateGraph, interrupt, MemorySaver } from "@langchain/langgraph";
import { GraphState, type GraphStateType } from "./graph-state";
import { buildResumeChain } from "./resume-chain";
import { buildJobChain } from "./job-chain";
import { buildScoringChain } from "./scoring-chain";
import { buildGapAnalysisChain } from "./gap-analysis-chain";

export { buildJobChain };
export { buildScoringChain };
export { buildGapAnalysisChain };

// ---------------------------------------------------------------------------
// Graph factory
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildScoringGraph(model: any) {
  const resumeChain = buildResumeChain(model);
  const jobChain = buildJobChain(model);
  const scoringChain = buildScoringChain(model);
  const gapChain = buildGapAnalysisChain(model);

  // Node 1: parse resume — reads resumeText, writes resumeData only
  async function parseResume(state: GraphStateType) {
    const resumeData = await resumeChain.invoke({ resume_text: state.resumeText });
    return { resumeData };
  }

  // Node 2: parse job description — reads jobText, writes jobData only
  async function parseJob(state: GraphStateType) {
    const jobData = await jobChain.invoke({ job_text: state.jobText });
    return { jobData };
  }

  // Node 3: score the match — reads resumeData + jobData + humanContext, writes matchResult
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

  // Conditional edge after scoreMatch: score >= 60 → gapAnalysis, else → awaitHuman (HITL)
  function routeAfterScore(state: GraphStateType): "gapAnalysis" | "awaitHuman" {
    return (state.matchResult?.score ?? 0) >= 60 ? "gapAnalysis" : "awaitHuman";
  }

  // Node 4: gap analysis — reads matchResult + resumeData + jobData, writes updated matchResult
  async function gapAnalysis(state: GraphStateType) {
    if (!state.matchResult) {
      throw new Error("gapAnalysis: matchResult is missing from graph state");
    }
    if (!state.resumeData) {
      throw new Error("gapAnalysis: resumeData is missing from graph state");
    }
    if (!state.jobData) {
      throw new Error("gapAnalysis: jobData is missing from graph state");
    }
    const updated = await gapChain.invoke({
      resume_data: JSON.stringify(state.resumeData, null, 2),
      job_data: JSON.stringify(state.jobData, null, 2),
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
