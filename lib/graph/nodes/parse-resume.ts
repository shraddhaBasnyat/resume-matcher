import { buildResumeChain } from "../../chains/resume-chain";
import type { GraphStateType } from "../state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeParseResumeNode(model: any) {
  const chain = buildResumeChain(model);
  return async function parseResume(state: GraphStateType) {
    const resumeData = await chain.invoke({ resume_text: state.resumeText });
    return { resumeData };
  };
}
