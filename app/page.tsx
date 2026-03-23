"use client";

import { useState, useRef } from "react";
import type { MatchResult } from "@/lib/match-schema";

export default function Home() {
  // --- Resume parser state ---
  const [parseStatus, setParseStatus] = useState<string | null>(null);
  const [parsedResumeText, setParsedResumeText] = useState<string | null>(null);
  const [parsedResumeJson, setParsedResumeJson] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Matcher state ---
  const [jobDescription, setJobDescription] = useState("");
  const [matchStatus, setMatchStatus] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState(false);
  const [humanContext, setHumanContext] = useState("");
  const [traceUrl, setTraceUrl] = useState<string | null>(null);

  // --- Parse resume ---
  async function handleParseSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setParseStatus("Parsing...");
    setParsedResumeText(null);
    setParsedResumeJson(null);

    const formData = new FormData();
    formData.append("resume", file);

    try {
      const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setParseStatus("Error: " + (data.message ?? data.error));
      } else {
        setParseStatus(null);
        setParsedResumeJson(JSON.stringify(data, null, 2));
        // Use summary + skills + experience as the text for matching
        const text = buildResumeTextFromData(data);
        setParsedResumeText(text);
      }
    } catch {
      setParseStatus("Failed to reach the server.");
    }
  }

  // Build a plain-text representation for the matcher from parsed resume JSON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function buildResumeTextFromData(data: any): string {
    const lines: string[] = [];
    if (data.name) lines.push(`Name: ${data.name}`);
    if (data.email) lines.push(`Email: ${data.email}`);
    if (data.summary) lines.push(`Summary: ${data.summary}`);
    if (data.skills?.length) lines.push(`Skills: ${data.skills.join(", ")}`);
    if (data.experience?.length) {
      lines.push("Experience:");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const exp of data.experience as any[]) {
        lines.push(`  - ${exp.role} at ${exp.company} (${exp.years} years)`);
      }
    }
    if (data.totalYearsExperience != null) {
      lines.push(`Total Experience: ${data.totalYearsExperience} years`);
    }
    if (data.keywords?.length) lines.push(`Keywords: ${data.keywords.join(", ")}`);
    return lines.join("\n");
  }

  // --- Match resume to job ---
  async function handleMatch(e: React.FormEvent) {
    e.preventDefault();
    if (!parsedResumeText || !jobDescription.trim()) return;

    setMatchStatus("Scoring...");
    setMatchResult(null);
    setInterrupted(false);
    setThreadId(null);
    setTraceUrl(null);

    await runMatch({ resumeText: parsedResumeText, jobText: jobDescription });
  }

  async function handleRescore(e: React.FormEvent) {
    e.preventDefault();
    if (!threadId) return;

    setMatchStatus("Re-scoring...");
    setMatchResult(null);
    setInterrupted(false);

    await runMatch({ humanContext, threadId });
  }

  async function runMatch(payload: {
    resumeText?: string;
    jobText?: string;
    humanContext?: string;
    threadId?: string;
  }) {
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok && res.status !== 202) {
        setMatchStatus("Error: " + (data.message ?? data.error));
        return;
      }

      setThreadId(data.threadId ?? null);
      setTraceUrl(data._meta?.traceUrl ?? null);

      if (data.status === "interrupted") {
        setInterrupted(true);
        setMatchResult(data.partialResult);
        setMatchStatus(null);
      } else {
        setMatchResult(data.matchResult);
        setMatchStatus(null);
      }
    } catch {
      setMatchStatus("Failed to reach the server.");
    }
  }

  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto space-y-12">
      {/* ---- Resume Parser ---- */}
      <section>
        <h1 className="text-2xl font-bold mb-6">Resume Parser</h1>
        <form onSubmit={handleParseSubmit} className="space-y-4">
          <input ref={fileInputRef} type="file" accept="application/pdf" className="block" />
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Parse Resume
          </button>
        </form>
        {parseStatus && <p className="mt-4 text-sm text-red-600">{parseStatus}</p>}
        {parsedResumeJson && (
          <pre className="mt-6 p-4 bg-gray-100 rounded text-sm overflow-auto max-h-64">
            {parsedResumeJson}
          </pre>
        )}
      </section>

      {/* ---- Job Matcher ---- */}
      <section>
        <h2 className="text-2xl font-bold mb-6">Job Matcher</h2>

        <form onSubmit={handleMatch} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Paste a job description</span>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={8}
              className="mt-1 block w-full border border-gray-300 rounded p-2 text-sm font-mono"
              placeholder="Paste the full job description here..."
            />
          </label>
          <button
            type="submit"
            disabled={!parsedResumeText || !jobDescription.trim()}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-40"
          >
            Match
          </button>
          {!parsedResumeText && (
            <p className="text-xs text-gray-500">Parse a resume first to enable matching.</p>
          )}
        </form>

        {matchStatus && <p className="mt-4 text-sm text-blue-600">{matchStatus}</p>}

        {/* Low-score HITL prompt */}
        {interrupted && (
          <div className="mt-6 p-4 border border-yellow-400 bg-yellow-50 rounded space-y-3">
            <p className="text-sm font-medium text-yellow-800">
              The AI scored this match low (
              {matchResult?.score !== undefined ? matchResult.score : "—"}
              /100). Add context about your experience that your resume does not show:
            </p>
            <form onSubmit={handleRescore} className="space-y-2">
              <textarea
                value={humanContext}
                onChange={(e) => setHumanContext(e.target.value)}
                rows={3}
                className="block w-full border border-yellow-300 rounded p-2 text-sm"
                placeholder="e.g. I led a team of 5 engineers for 2 years but it was off the books..."
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!humanContext.trim()}
                  className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-40 text-sm"
                >
                  Re-score
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInterrupted(false);
                    // Accept result as-is by resuming with empty context
                    runMatch({ humanContext: "", threadId: threadId ?? undefined });
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm"
                >
                  Accept result
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Match result display */}
        {matchResult && !interrupted && (
          <div className="mt-6 space-y-4">
            {/* Score */}
            <div className="flex items-center gap-3">
              <span
                className={`text-5xl font-bold ${
                  matchResult.score >= 75
                    ? "text-green-600"
                    : matchResult.score >= 50
                    ? "text-yellow-600"
                    : "text-red-600"
                }`}
              >
                {matchResult.score}
              </span>
              <span className="text-gray-500 text-lg">/ 100</span>
            </div>

            {/* Narrative alignment */}
            {matchResult.narrativeAlignment && (
              <p className="text-sm text-gray-700 italic">{matchResult.narrativeAlignment}</p>
            )}

            {/* Matched skills */}
            {matchResult.matchedSkills.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Matched Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {matchResult.matchedSkills.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Missing skills */}
            {matchResult.missingSkills.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Missing Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {matchResult.missingSkills.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resume advice */}
            {matchResult.resumeAdvice.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Resume Advice</h3>
                <ul className="list-disc list-inside space-y-1">
                  {matchResult.resumeAdvice.map((advice, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      {advice}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Gaps */}
            {matchResult.gaps.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Gaps</h3>
                <ul className="list-disc list-inside space-y-1">
                  {matchResult.gaps.map((gap, i) => (
                    <li key={i} className="text-sm text-gray-500">
                      {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* LangSmith trace link */}
            {traceUrl && (
              <a
                href={traceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                View trace in LangSmith
              </a>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
