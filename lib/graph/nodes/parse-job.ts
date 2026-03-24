import { buildJobChain } from "../../chains/job-chain";
import type { GraphStateType } from "../state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function makeParseJobNode(model: any) {
  const chain = buildJobChain(model);
  return async function parseJob(state: GraphStateType) {
    const jobData = await chain.invoke({ job_text: state.jobText });
    return { jobData };
  };
}
