## Testing conventions

- Use top-level `vi.mock()`, never `vi.doMock()`. vi.mock() is hoisted before imports;
  vi.doMock() does not intercept already-imported modules and will leak real network calls
  if LANGCHAIN_TRACING_V2 is enabled.

- All model mocks must include `bind: vi.fn().mockReturnThis()`. Chain factories call
  .bind({ temperature: 0 }) at construction time — a plain object mock without it throws.

- Declare RootRunCapture as a regular function, not an arrow function. Arrow functions are
  not constructable — new RootRunCapture(...) will throw. vi.doMock() was masking this;
  vi.mock() exposes it correctly.

- Do not write schema self-validation tests (fixture validated against itself). They pass
  unconditionally and cover nothing real.

- Model mocks must use bind: vi.fn().mockReturnThis() — not mockReturnValue(mockBound).
  mockReturnThis() returns the mock object itself, so withStructuredOutput is always called
  on the same object regardless of whether .bind() is called first. This means mocks stay
  correct when temperature overrides are added or removed — the test is not coupled to
  whether .bind() is in the chain.

- Every chain must have a validation failure test: mock the model to return an invalid
  shape, assert the node rejects with ZodError, assert logValidationFailure was called
  with the raw output and nodeName. This validates the throw validated.error policy —
  without it a regression back to a silent fallback passes the suite undetected.

- Validation failure tests assert via namespace import: import * as langsmith from "../langsmith.js"
  gives a reference to the mocked module after vi.mock(). langsmith.logValidationFailure is the 
  same vi.fn() instance from the mock factory.
  
- Use expect.objectContaining({ nodeName: "...", rawOutput: invalidOutput }) — do not assert on
  runId or errors. nodeName confirms the correct chain reported the failure. rawOutput confirms
  the raw LLM response was captured, not something derived from it. objectContaining means the
  test survives additions to the call signature without breaking.

## Chain conventions

- Verdict nodes (analyzeStrongMatch, analyzeNarrativeGap, analyzeSkepticalReconciliation):
  no temperature override. No .bind() call — no bind mock needed in tests.
- Scoring/mechanical nodes (atsAnalysis, scoreMatch): .bind({ temperature: 0 })
- All chains: safeParse → logValidationFailure → throw validated.error
  Never use Schema.parse({ ...result }) as a fallback — spreading a null/undefined result
  throws a TypeError that masks the real Zod validation error.
- Explicit invoke wrapper, not pipe
- RootRunCapture must be a regular function declaration, not an arrow function
- Strip resumeAdvice before serialising matchResult into any verdict node prompt

## Error handling

On validation failure, call `throw validated.error` after `logValidationFailure` —
do not use `Schema.parse({ ...result })`. Spreading a null/undefined result throws
a TypeError that masks the real Zod validation error.

## buildMockModel is load-bearing

Every new verdict node chain must add its LLM schema to buildMockModel in
scoring-graph.test.ts. The fallback return { invoke: vi.fn().mockResolvedValue(validMatchResult) }
returns data that fails strict schema validation. With throw validated.error this surfaces
immediately instead of being masked. Pattern: match ConfirmedFitLLMSchema, InvisibleExpertLLMSchema,
and NarrativeGapLLMSchema cases already in buildMockModel.

## Strip resumeAdvice before serialising matchResult

The node destructures state.matchResult before passing it to the chain — resumeAdvice is
excluded. The LLM receives: narrativeAlignment, matchedSkills, missingSkills, gaps, fitScore,
contextPrompt, weakMatch. This prevents the model anchoring to stale scoreMatch advice.
Apply this pattern in all verdict nodes.

## throw validated.error is not optional

Schema.parse({ ...result }) masked real Zod validation errors with TypeErrors when result
was null/undefined or malformed. throw validated.error surfaces the real failure. The
integration tests confirmed this — ZodError appeared cleanly once the spread was removed.

## Temperature per node

- atsAnalysis, scoreMatch: .bind({ temperature: 0 })
  These produce scores and structured mechanical outputs — determinism matters.
- analyzeStrongMatch, analyzeNarrativeGap, analyzeSkepticalReconciliation: no temperature override.
  Verdict nodes produce prose and advice. Temperature 0 produces flat output that fails the
  specificity test. No .bind() call — no bind mock needed in tests for these nodes.

## Schema conventions

Nullable string fields must use z.string().min(1).nullable() — not 
z.string().nullable(). The latter accepts empty string silently, which 
passes safeParse and undermines the null contract. null is valid, 
empty string is not.

## Node output validation

Chain-level Zod validation catches LLM output errors — do not add 
redundant Zod parsing at the node boundary. Node assembly correctness 
is enforced by typing fitAdvice as FitAdvice | null in scoring-graph-state.ts 
and using `satisfies` on node return values where assembly is complex.

## Known tech debt

FitAdvice is defined twice — as Zod schemas in chain files and as TypeScript 
interfaces in api.ts. These must be kept in sync manually. The correct fix 
is a shared FitAdviceSchema Zod discriminated union with types derived via 
z.infer<>. Deferred — address when a verdict node schema changes.

## State field ownership

Before adding a node that reads or writes graph state, check the field 
ownership table in ARCHITECTURE.md. Every field has one writer — do not 
write to a field owned by another node without updating the table.