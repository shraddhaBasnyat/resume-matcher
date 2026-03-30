"use client";

import { useState, useRef, useCallback } from "react";
import type { Resume } from "@/lib/schemas/resume-schema";
import type { JobDescription } from "@/lib/schemas/job-schema";
import type { MatchResult } from "@/lib/schemas/match-schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppState = "idle" | "running" | "interrupted" | "completed" | "cancelled";
type StepStatus = "waiting" | "running" | "done";

interface NodeProgress {
  status: StepStatus;
  durationMs?: number;
}

interface MatchResponse {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  narrativeAlignment: string;
  gaps: string[];
  resumeAdvice: string[];
  weakMatch: boolean;
  weakMatchReason?: string;
  resumeData: Resume;
  jobData: JobDescription;
  interrupted: boolean;
  threadId: string;
  _meta: { traceUrl: string | null; durationMs: number };
}

const STEPS: { key: string; label: string }[] = [
  { key: "parseResume", label: "Parsing resume" },
  { key: "parseJob", label: "Parsing job" },
  { key: "scoreMatch", label: "Scoring match" },
  { key: "gapAnalysis", label: "Gap analysis" },
];

const INITIAL_PROGRESS: Record<string, NodeProgress> = {
  parseResume: { status: "waiting" },
  parseJob: { status: "waiting" },
  scoreMatch: { status: "waiting" },
  gapAnalysis: { status: "waiting" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  // App state machine
  const [appState, setAppState] = useState<AppState>("idle");

  // Inputs
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Run tracking (for cancellation)
  const [threadId, setThreadId] = useState<string | null>(null);
  const [rootRunId, setRootRunId] = useState<string | null>(null);
  const [runStartTime, setRunStartTime] = useState<number | null>(null);

  // HITL
  const [humanContext, setHumanContext] = useState("");
  const [interruptedScore, setInterruptedScore] = useState<number | null>(null);

  // Results
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Node progress
  const [progress, setProgress] = useState<Record<string, NodeProgress>>(INITIAL_PROGRESS);

  // Collapsible toggles
  const [showResumeData, setShowResumeData] = useState(false);
  const [showJobData, setShowJobData] = useState(false);

  // Abort reader ref — used to abandon an in-flight stream
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  // ---------------------------------------------------------------------------
  // PDF upload — text extraction only
  // ---------------------------------------------------------------------------

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseLoading(true);
    setParseError(null);
    setResumeText(null);

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setParseError(data.message ?? data.error ?? "Failed to extract text");
      } else {
        setResumeText(data.text ?? null);
      }
    } catch {
      setParseError("Failed to reach the server.");
    } finally {
      setParseLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // SSE stream processing
  // ---------------------------------------------------------------------------

  const processStream = useCallback(async (response: Response) => {
    const reader = response.body!.getReader();
    readerRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          let event = "";
          let data = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6).trim();
          }
          if (!event || !data) continue;

          try {
            const payload = JSON.parse(data);
            handleSSEEvent(event, payload);
          } catch {
            // malformed event — skip
          }
        }
      }
    } catch {
      // Reader cancelled or connection dropped — ignore if we initiated the cancel
    } finally {
      readerRef.current = null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSSEEvent(event: string, payload: Record<string, unknown>) {
    switch (event) {
      case "meta":
        if (payload.threadId) setThreadId(payload.threadId as string);
        if (payload.rootRunId) setRootRunId(payload.rootRunId as string);
        if (payload.runStartTime) setRunStartTime(payload.runStartTime as number);
        break;

      case "node_start":
        setProgress((prev) => ({
          ...prev,
          [payload.node as string]: { status: "running" },
        }));
        break;

      case "node_done":
        setProgress((prev) => ({
          ...prev,
          [payload.node as string]: {
            status: "done",
            durationMs: payload.durationMs as number,
          },
        }));
        break;

      case "completed":
        setResult(payload.result as MatchResponse);
        setAppState("completed");
        break;

      case "interrupted":
        setInterruptedScore(payload.score as number | null);
        if (payload.threadId) setThreadId(payload.threadId as string);
        setAppState("interrupted");
        break;

      case "error":
        setMatchError((payload.message as string) ?? (payload.error as string) ?? "Unknown error");
        setAppState("idle");
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Match
  // ---------------------------------------------------------------------------

  async function handleMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!resumeText || !jobDescription.trim()) return;

    setAppState("running");
    setResult(null);
    setMatchError(null);
    setThreadId(null);
    setRootRunId(null);
    setRunStartTime(Date.now());
    setProgress(INITIAL_PROGRESS);
    setHumanContext("");

    try {
      const res = await fetch("/api/match/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText, jobText: jobDescription }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMatchError(data.message ?? data.error ?? "Request failed");
        setAppState("idle");
        return;
      }

      await processStream(res);
    } catch {
      setMatchError("Failed to reach the server.");
      setAppState("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Re-score (HITL resume)
  // ---------------------------------------------------------------------------

  async function handleRescore(e: React.FormEvent) {
    e.preventDefault();
    if (!threadId || !humanContext.trim()) return;

    setAppState("running");
    setMatchError(null);
    setRootRunId(null);
    setRunStartTime(Date.now());
    setProgress(INITIAL_PROGRESS);

    try {
      const res = await fetch("/api/match/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanContext, threadId }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setMatchError(data.message ?? data.error ?? "Request failed");
        setAppState("idle");
        return;
      }

      await processStream(res);
    } catch {
      setMatchError("Failed to reach the server.");
      setAppState("idle");
    }
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------

  async function handleCancel() {
    // Stop reading the SSE stream
    try {
      await readerRef.current?.cancel();
    } catch {
      // ignore
    }

    // Notify server to abort and update LangSmith trace
    if (threadId) {
      fetch("/api/match/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          rootRunId: rootRunId ?? undefined,
          runStartTime: runStartTime ?? undefined,
        }),
      }).catch(() => {});
    }

    setAppState("idle");
    setThreadId(null);
    setRootRunId(null);
    setRunStartTime(null);
    setResult(null);
    setProgress(INITIAL_PROGRESS);
  }

  // ---------------------------------------------------------------------------
  // Derived UI flags
  // ---------------------------------------------------------------------------

  const isInputsDisabled = appState === "running" || appState === "interrupted";
  const canMatch = !isInputsDisabled && !!resumeText && !!jobDescription.trim();
  const showCancel = appState === "running" || appState === "interrupted";

  // ---------------------------------------------------------------------------
  // Score color
  // ---------------------------------------------------------------------------

  function scoreColor(score: number) {
    if (score >= 70) return "text-green-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="min-h-screen p-8 max-w-4xl mx-auto space-y-10">
      <h1 className="text-3xl font-bold">Resume Matcher</h1>

      {/* ---- Inputs ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: PDF upload */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Resume (PDF)</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            disabled={isInputsDisabled}
            onChange={handleFileUpload}
            className="block w-full text-sm disabled:opacity-50"
          />
          {parseLoading && <p className="text-sm text-blue-600">Extracting text…</p>}
          {parseError && <p className="text-sm text-red-600">{parseError}</p>}
          {resumeText && !parseLoading && (
            <p className="text-sm text-green-700">Resume text extracted ({resumeText.length} chars)</p>
          )}
        </div>

        {/* Right: Job description */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Job Description</h2>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            disabled={isInputsDisabled}
            rows={7}
            className="block w-full border border-gray-300 rounded p-2 text-sm font-mono disabled:opacity-50"
            placeholder="Paste the full job description here…"
          />
        </div>
      </div>

      {/* ---- Match / Cancel button ---- */}
      <div className="flex gap-3 items-center">
        {showCancel ? (
          <button
            type="button"
            onClick={handleCancel}
            className="px-5 py-2 bg-red-600 text-white rounded hover:bg-red-700 font-medium"
          >
            Cancel
          </button>
        ) : (
          <form onSubmit={handleMatch}>
            <button
              type="submit"
              disabled={!canMatch}
              className="px-5 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40 font-medium"
            >
              Match
            </button>
          </form>
        )}
        {!resumeText && appState === "idle" && (
          <p className="text-xs text-gray-500">Upload a resume PDF to enable matching.</p>
        )}
      </div>

      {matchError && <p className="text-sm text-red-600">{matchError}</p>}

      {/* ---- Node progress indicator ---- */}
      {(appState === "running" || appState === "interrupted" || appState === "completed") && (
        <div className="space-y-2">
          {STEPS.map(({ key, label }) => {
            const step = progress[key];
            return (
              <div key={key} className="flex items-center gap-3 text-sm">
                {step.status === "waiting" && (
                  <span className="w-4 h-4 rounded-full bg-gray-200 shrink-0" />
                )}
                {step.status === "running" && (
                  <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                )}
                {step.status === "done" && (
                  <span className="w-4 h-4 rounded-full bg-green-500 shrink-0 flex items-center justify-center text-white text-[10px]">
                    ✓
                  </span>
                )}
                <span
                  className={
                    step.status === "waiting"
                      ? "text-gray-400"
                      : step.status === "running"
                      ? "text-blue-700 font-medium"
                      : "text-green-700"
                  }
                >
                  {label}
                </span>
                {step.status === "done" && step.durationMs != null && (
                  <span className="text-gray-400 text-xs">
                    {(step.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ---- HITL: human context form ---- */}
      {appState === "interrupted" && (
        <div className="p-4 border border-yellow-400 bg-yellow-50 rounded space-y-3">
          <p className="text-sm font-medium text-yellow-800">
            Score too low ({interruptedScore != null ? interruptedScore : "—"}/100). Add context
            about your experience that your resume does not show:
          </p>
          <form onSubmit={handleRescore} className="space-y-2">
            <textarea
              value={humanContext}
              onChange={(e) => setHumanContext(e.target.value)}
              rows={3}
              className="block w-full border border-yellow-300 rounded p-2 text-sm"
              placeholder="e.g. I led a team of 5 engineers for 2 years but it was off the books…"
            />
            <button
              type="submit"
              disabled={!humanContext.trim()}
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-40 text-sm font-medium"
            >
              Re-score
            </button>
          </form>
        </div>
      )}

      {/* ---- Results ---- */}
      {appState === "completed" && result && (
        <div className="space-y-6">
          {/* Score */}
          <div className="flex items-baseline gap-2">
            <span className={`text-6xl font-bold ${scoreColor(result.score)}`}>
              {result.score}
            </span>
            <span className="text-2xl text-gray-400">/ 100</span>
          </div>

          {/* Narrative */}
          {result.narrativeAlignment && (
            <p className="text-sm text-gray-700 italic leading-relaxed">
              {result.narrativeAlignment}
            </p>
          )}

          {/* Matched skills */}
          {result.matchedSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Matched Skills</h3>
              <div className="flex flex-wrap gap-2">
                {result.matchedSkills.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missing skills */}
          {result.missingSkills.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Missing Skills</h3>
              <div className="flex flex-wrap gap-2">
                {result.missingSkills.map((s) => (
                  <span key={s} className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Narrative alignment */}
          {result.gaps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Gaps</h3>
              <ul className="list-disc list-inside space-y-1">
                {result.gaps.map((gap, i) => (
                  <li key={i} className="text-sm text-gray-600">
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Resume advice */}
          {result.resumeAdvice.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Resume Advice</h3>
              <ol className="list-decimal list-inside space-y-1">
                {result.resumeAdvice.map((advice, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    {advice}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Weak match reason */}
          {result.weakMatch && result.weakMatchReason && (
            <p className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">
              {result.weakMatchReason}
            </p>
          )}

          {/* Collapsible: how resume was parsed */}
          <details
            open={showResumeData}
            onToggle={(e) => setShowResumeData((e.target as HTMLDetailsElement).open)}
            className="border border-gray-200 rounded"
          >
            <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-600 select-none">
              How your resume was parsed
            </summary>
            <pre className="p-4 text-xs bg-gray-50 overflow-auto max-h-80 border-t border-gray-200">
              {JSON.stringify(result.resumeData, null, 2)}
            </pre>
          </details>

          {/* Collapsible: how job was parsed */}
          <details
            open={showJobData}
            onToggle={(e) => setShowJobData((e.target as HTMLDetailsElement).open)}
            className="border border-gray-200 rounded"
          >
            <summary className="px-4 py-2 cursor-pointer text-sm font-medium text-gray-600 select-none">
              How the job was parsed
            </summary>
            <pre className="p-4 text-xs bg-gray-50 overflow-auto max-h-80 border-t border-gray-200">
              {JSON.stringify(result.jobData, null, 2)}
            </pre>
          </details>

          {/* LangSmith trace link */}
          {result._meta.traceUrl && (
            <a
              href={result._meta.traceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
            >
              View trace in LangSmith
            </a>
          )}
        </div>
      )}
    </main>
  );
}
