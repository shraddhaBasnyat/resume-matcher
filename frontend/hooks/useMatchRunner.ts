"use client";

import { useState, useRef, useCallback } from "react";
import {
  AppState,
  NodeProgress,
  MatchResponse,
  INITIAL_PROGRESS,
} from "@/lib/match-constants";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export interface UseMatchRunnerReturn {
  appState: AppState;
  resumeText: string | null;
  jobDescription: string;
  parseLoading: boolean;
  parseError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  humanContext: string;
  interruptedScore: number | null;
  result: MatchResponse | null;
  matchError: string | null;
  progress: Record<string, NodeProgress>;
  showResumeData: boolean;
  showJobData: boolean;
  isInputsDisabled: boolean;
  canMatch: boolean;
  showCancel: boolean;
  setJobDescription: (v: string) => void;
  setHumanContext: (v: string) => void;
  setShowResumeData: (v: boolean) => void;
  setShowJobData: (v: boolean) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleMatch: (e: React.FormEvent) => Promise<void>;
  handleRescore: (e: React.FormEvent) => Promise<void>;
  handleCancel: () => Promise<void>;
  scoreColor: (score: number) => string;
}

export function useMatchRunner(): UseMatchRunnerReturn {
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
  // Set to true by handleCancel so processStream's catch/finally blocks stay silent
  const cancelledRef = useRef(false);

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
      const res = await fetch(`${BACKEND_URL}/api/parse-resume`, { method: "POST", body: formData });
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
    let receivedTerminalEvent = false;

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
          receivedTerminalEvent = true;
          setResult(payload.result as MatchResponse);
          setAppState("completed");
          break;

        case "interrupted":
          receivedTerminalEvent = true;
          setInterruptedScore(payload.score as number | null);
          if (payload.threadId) setThreadId(payload.threadId as string);
          setAppState("interrupted");
          break;

        case "error":
          receivedTerminalEvent = true;
          setMatchError((payload.message as string) ?? (payload.error as string) ?? "Unknown error");
          setAppState("idle");
          break;
      }
    }

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

      if (!receivedTerminalEvent && !cancelledRef.current) {
        setMatchError("Connection closed unexpectedly. Please try again.");
        setAppState("idle");
      }
    } catch (error) {
      const isAbortError =
        error instanceof DOMException && error.name === "AbortError";
      if (!cancelledRef.current && !isAbortError) {
        setMatchError("Connection lost. Please try again.");
        setAppState("idle");
      }
    } finally {
      readerRef.current = null;
    }
  }, []);

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
      const res = await fetch(`${BACKEND_URL}/api/match/run`, {
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
      const res = await fetch(`${BACKEND_URL}/api/match/resume`, {
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
    // Mark as user-initiated so processStream's error/finally paths stay silent
    cancelledRef.current = true;
    try {
      await readerRef.current?.cancel();
    } catch {
      // ignore
    } finally {
      cancelledRef.current = false;
    }

    // Notify server to abort and update LangSmith trace
    if (threadId) {
      fetch(`${BACKEND_URL}/api/match/cancel`, {
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

  return {
    appState,
    resumeText,
    jobDescription,
    parseLoading,
    parseError,
    fileInputRef,
    humanContext,
    interruptedScore,
    result,
    matchError,
    progress,
    showResumeData,
    showJobData,
    isInputsDisabled,
    canMatch,
    showCancel,
    setJobDescription,
    setHumanContext,
    setShowResumeData,
    setShowJobData,
    handleFileUpload,
    handleMatch,
    handleRescore,
    handleCancel,
    scoreColor,
  };
}
