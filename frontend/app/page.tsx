"use client";

import { STEPS } from "@/lib/match-constants";
import { useMatchRunner } from "@/hooks/useMatchRunner";
import { MatchProgress } from "@/components/match/MatchProgress";
import { HitlForm } from "@/components/match/HitlForm";
import { MatchResult } from "@/components/match/MatchResult";

export default function Home() {
  const {
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
    handleAccept,
    handleCancel,
    scoreColor,
  } = useMatchRunner();

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

      <MatchProgress appState={appState} progress={progress} steps={STEPS} />

      {appState === "interrupted" && (
        <HitlForm
          interruptedScore={interruptedScore}
          humanContext={humanContext}
          onHumanContextChange={setHumanContext}
          onRescore={handleRescore}
          onAccept={handleAccept}
        />
      )}

      {appState === "completed" && result && (
        <MatchResult
          result={result}
          showResumeData={showResumeData}
          showJobData={showJobData}
          onToggleResumeData={setShowResumeData}
          onToggleJobData={setShowJobData}
          scoreColor={scoreColor}
        />
      )}
    </main>
  );
}
