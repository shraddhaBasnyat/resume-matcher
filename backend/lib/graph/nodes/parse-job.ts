import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildJobChain } from "../../chains/job-chain.js";
import type { GraphStateType } from "../state.js";

export function makeParseJobNode(model: BaseChatModel) {
  const chain = buildJobChain(model);
  return async function parseJob(state: GraphStateType) {
    const jobData = await chain.invoke({ job_text: state.jobText });
    return { jobData };
  };
}
