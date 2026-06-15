# ADR 005: LLM wrapper factories as eval entry points and observability boundary

## Date
2026-06-15

## Status
Accepted — implementation in progress

## Context

The current codebase follows a chains-inside-nodes pattern — each LangGraph node delegates its LLM call to a separate chain factory function in `backend/chains/`. This pattern originates from LangChain's legacy migration story: when teams ported existing LangChain chains into LangGraph, they wrapped their chains inside nodes to preserve existing code. For greenfield LangGraph projects this pattern is unnecessary — nodes can use LCEL inline — but it was introduced here by Claude Code without that distinction being made explicit.

More critically, the chains in `backend/chains/` are not real LangChain chains. A real LCEL chain is a `RunnableSequence` produced by `prompt.pipe(model.withStructuredOutput(Schema))`. The current factories return plain objects with an `invoke` method — duck-typed to look like chains but with none of the Runnable capabilities. Inside `invoke`, they call `prompt.invoke()` and `structuredModel.invoke()` directly rather than using `.pipe()` to produce a proper `RunnableSequence`. This means the chain layer is invisible to LangChain's callback system, config propagation, and LangSmith tracing. This architecture was likely produced by early vibe coding — Claude Code was not given explicit constraints around LangChain extension patterns or testing conventions, and defaulted to the simplest working implementation rather than the correct one.

A code review session (2026-06-15) identified several problems with the current implementation:

1. **Wrong abstraction type.** The chain factories return plain objects `{ invoke: async () => {} }`, not real LangChain `Runnable` instances. This means LangChain's config propagation, callback threading, and `handleChainStart`/`handleChainEnd` lifecycle hooks never fire for these objects. They are invisible to LangSmith — the trace tree shows `ChatPromptTemplate` and `ChatAnthropic` as direct children of the node, with no intermediate chain layer.

2. **Broken config threading.** Because the chains are plain objects, `RunnableConfig` (including LangGraph's injected `callbacks` and `run_id`) is not automatically propagated. Config is dropped at the chain boundary — `structuredModel.invoke(messages)` is called with no config. This does not cause errors today, but any feature requiring config to reach the LLM call (tracing context, cancellation signal, custom callbacks) would require a manual `...config` spread hack rather than automatic propagation.

3. **Wrong pattern for LangGraph.** Chains-inside-nodes is a legacy migration pattern — used when teams port existing LangChain chains into LangGraph without rewriting them. For greenfield LangGraph projects, the idiomatic pattern is LCEL inline inside the node function. The plain object factory pattern in the current codebase is neither idiomatic LangGraph nor a proper LangChain `Runnable` subclass — it is a workaround that has the shape of a chain without any of the Runnable capabilities. The current `build*Chain` factory pattern implies LangChain legacy migration to any reader, which is misleading.

4. **Naming is dishonest.** `buildAnalyzeFitChain` implies a real LangChain chain — but the factory returns a plain object with no Runnable capabilities. The name creates false expectations and implies legacy migration semantics that don't apply.

5. **Mock testability constraint.** The recommended way to test LangChain components is `FakeListChatModel` from `@langchain/core/utils/testing` — a real `BaseChatModel` that has all model methods including `withStructuredOutput()`, but returns pre-configured fake responses instead of calling the real API. This is the correct mock because it exercises the same code paths as a real model without incurring API cost or latency. The current chain factories prevented this. Because the factories return plain objects that call `prompt.invoke()` and `structuredModel.invoke()` manually — bypassing the `BaseChatModel` interface — tests could only mock at the `invoke()` level using `{ invoke: vi.fn() }`. Using `FakeListChatModel` with the current architecture would require the factory to call `this.model.withStructuredOutput(Schema)`, which the plain object pattern never does. The plain object mock `{ invoke: vi.fn() }` is an unnecessary hack — it exists only because the current chain architecture bypasses the real model interface. A proper `BaseChatModel` mock (`FakeListChatModel`) is the correct approach and is only possible once the chain architecture is fixed.

LangSmith can extract node-level inputs and outputs from production traces directly without a separate wrapper layer. The wrapper layer exists for two different reasons:

1. **Explicit input contract.** The wrapper documents exactly what the LLM call needs, separate from what the node reads from graph state. This is developer ergonomics, not runtime enforcement.

2. **Silent eval and testing drift protection.** LangGraph nodes receive the full `GraphStateType` — every node can read any field from state without declaring it in its signature. There is no enforced contract between what state a node is supposed to read and what it actually reads at runtime. A new field read added silently to a node implementation is invisible to TypeScript and invisible to tests unless the test explicitly sets that field. The wrapper's narrow typed input interface (`{ resume_text: string; job_text: string }`) forces promptfoo evals and unit tests to break loudly on any change.

## Decision

**1. Rename `backend/chains/` to `backend/llm-wrappers/`, and rename each chain file to `*.wrapper.ts`.**

`chains/` implies LangChain legacy migration and plain chain objects. `llm-wrappers/` describes purpose — these files wrap LLM calls with prompt formatting, structured output, Zod validation, and a named observability span. File names follow the same convention: `analyze-fit-chain.ts` → `analyze-fit.wrapper.ts`, `ats-analysis-chain.ts` → `ats-analysis.wrapper.ts`, etc. Factory function names keep the `Runnable` suffix since what they return IS a Runnable: `buildAnalyzeFitRunnable`, `buildAtsAnalysisRunnable`, etc.

**2. Convert plain object factories to `RunnableLambda.from().withConfig()`.**

Each runnable becomes a factory function returning a `RunnableLambda` — the documented public API for wrapping custom logic in LangChain. This gives a named span in LangSmith via `withConfig({ runName })`, correct config threading via LCEL pipe inside the lambda, and Zod validation on the output. No subclassing, no framework internals.

```ts
// backend/llm-wrappers/analyze-fit.wrapper.ts
import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { SYSTEM, HUMAN } from "./analyze-fit.prompt.js";
import { AnalyzeFitLLMSchema } from "./analyze-fit.schema.js";
import type { AnalyzeFitLLMOutput } from "./analyze-fit.schema.js";

export const ANALYZE_FIT_RUN_NAME = "AnalyzeFitRunnable";

const prompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM],
  ["human", HUMAN],
]);

export function buildAnalyzeFitRunnable(model: BaseChatModel) {
  const chain = prompt.pipe(model.withStructuredOutput(AnalyzeFitLLMSchema));

  return RunnableLambda.from(async (
    input: { resume_text: string; job_text: string },
    config?: RunnableConfig
  ): Promise<AnalyzeFitLLMOutput> => {
    const result = await chain.invoke(input, config);

    const validated = AnalyzeFitLLMSchema.safeParse(result);
    if (!validated.success) {
      console.error(`[validation-failed] ${ANALYZE_FIT_RUN_NAME}`, validated.error.flatten(), result);
      throw validated.error;
    }

    return validated.data;
  }).withConfig({ runName: ANALYZE_FIT_RUN_NAME });
}
```

**Why a factory function in a separate file rather than inline `RunnableLambda` inside the node:** The factory function is the promptfoo eval entry point. Promptfoo needs to call the LLM layer directly with a narrow typed input — `{ resume_text, job_text }` — without constructing a full `GraphStateType` or invoking the graph. Without the separate factory, promptfoo would have to call the node or graph directly, losing the narrow input contract that provides silent eval drift protection. If promptfoo evals are ever removed, the factory functions can be inlined into their nodes with no other architectural change.

**Why Zod validation after `withStructuredOutput`:** `ChatAnthropic.withStructuredOutput()` actually runs Zod validation internally via `AnthropicToolsOutputParser` — on a real Anthropic call, if the schema fails, it throws `OutputParserException` before your code sees the result. So `safeParse` in the wrapper is effectively dead code on the success path against real Anthropic calls. However it serves two real purposes: (1) `FakeListChatModel.withStructuredOutput()` ignores the schema entirely and just JSON-parses — so `safeParse` is the only validation that runs in tests, which is what makes the validation-failure tests work; (2) if the model is swapped to a non-Anthropic provider (e.g. Ollama in local dev) that doesn't run Zod validation, `safeParse` catches schema drift. Keep it — it's load-bearing for tests and cross-provider safety.

**Why `RunnableLambda` over a `Runnable` subclass:** `RunnableLambda.from()` is the documented public API for custom logic. Subclassing `Runnable` requires touching `_callWithConfig` and `_invoke` — internal conventions, not public API. `RunnableLambda` fires `handleChainStart`/`handleChainEnd` automatically, giving the named span in LangSmith without framework internals.

**3. Use `FakeListChatModel` in tests instead of plain object mocks.**

`FakeListChatModel` (from `@langchain/core/utils/testing`) is a real `BaseChatModel` — it works with `.pipe()` and `withStructuredOutput()`, unlike plain object mocks which fail when `.pipe()` is called on them.


## Consequences

Good:
- Config threads automatically through LCEL pipe inside the lambda — no manual spreading needed
- Named span in LangSmith via `withConfig({ runName })` — `RunnableLambda` fires `handleChainStart`/`handleChainEnd` automatically, making the LLM call visible as a distinct span between the node and `ChatAnthropic`
- Silent eval and testing drift protection — wrapper typed input forces loud failures when LLM call dependencies change
- `FakeListChatModel` replaces plain object mocks — tests exercise real model behavior
- `llm-wrappers/` directory name signals purpose — not a migration artifact, not an implementation detail
- No framework internals touched — `RunnableLambda.from()` is documented public API

Bad:
- Non-trivial refactor — 5 plain object factories to convert, 5 node files to update, all tests to migrate to `FakeListChatModel`
- `FakeListChatModel` response format requires understanding — more setup than `{ invoke: vi.fn() }`
- More files — one wrapper file per LLM node, but consistent and predictable

## Eval tooling

This ADR establishes a two-tool eval strategy:

| Tool | Data source | Purpose | When it runs |
|------|-------------|---------|--------------|
| promptfoo | Synthetic fixtures — you control inputs | Regression gate — catches known failure modes before deploy | CI — blocks deploy |
| LangSmith | Production traces — real user inputs | Quality monitoring — catches drift and edge cases after deploy | Continuous |

Both tools can eval at runnable, node, or graph level. The distinction is data source and timing — not granularity. Promptfoo calls inference runnables directly via a custom provider; LangSmith uses real production traces.

## Alternatives considered

1. **LCEL inline with `RunnableLambda` inside each node, no separate runnable layer**
   → Rejected: Zod validation and error logging after `withStructuredOutput` need to live somewhere. A `RunnableLambda` wrapper is needed either way; moving it to a separate file gives the explicit input contract and silent eval drift protection that inline LCEL alone cannot provide.

2. **`Runnable` subclass with `_callWithConfig` and `_invoke`**
   → Rejected: to get a named span in LangSmith, a `Runnable` subclass must call `_callWithConfig` internally — this is what fires `handleChainStart`/`handleChainEnd`. Simply overriding `invoke` directly gives you config threading but no named span. `_callWithConfig` and `_invoke` are internal conventions, not public API. `RunnableLambda.from()` achieves the same result — named span, config threading, callback lifecycle — using the documented public API with no framework internals.

3. **Separate wrapper layer for inference nodes only, LCEL inline for verdict nodes**
   → Rejected: the eval drift protection and input contract arguments apply equally to verdict nodes. Consistency across all LLM nodes is simpler — no decision needed about which nodes get a wrapper file.

## Links
- Design session: 2026-06-15
- ADR 004: Graph architecture redesign (`analyzeJD`/`analyzeResume`)
- LangChain `RunnableLambda`: `@langchain/core/runnables` (`RunnableLambda.from()`)
- LangChain testing utilities: `@langchain/core/utils/testing` (`FakeListChatModel`)