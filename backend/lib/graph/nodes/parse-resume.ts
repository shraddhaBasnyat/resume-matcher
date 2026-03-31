import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { buildResumeChain } from "../../chains/resume-chain.js";
import type { GraphStateType } from "../state.js";

export function makeParseResumeNode(model: BaseChatModel) {
  const chain = buildResumeChain(model);
  return async function parseResume(state: GraphStateType) {
    const resumeData = await chain.invoke({ resume_text: state.resumeText });
    return { resumeData };
  };
}
