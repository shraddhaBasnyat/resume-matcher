"use client";

import { Header } from "@/components/layout/Header";
import UploadSection from "@/components/layout/UploadSection";
import { MainResultsStage } from "@/components/resume-init/MainResultsStage";
import { useMatchRunner } from "@/hooks/useMatchRunner";

export default function V2Page() {
  const {
    appState,
    result,
    progress,
    resumeText,
    jobDescription,
    parseLoading,
    parseError,
    fileInputRef,
    canMatch,
    isInputsDisabled,
    setJobDescription,
    handleFileUpload,
    handleMatch,
    handleCancel,
    handleClearResume,
  } = useMatchRunner();

  return (
    <div className="min-h-screen bg-muted">
      <Header />
      <div style={{ padding: "8px 24px" }}>
        <UploadSection
          resumeText={resumeText}
          jobDescription={jobDescription}
          parseLoading={parseLoading}
          parseError={parseError}
          fileInputRef={fileInputRef}
          canMatch={canMatch}
          isInputsDisabled={isInputsDisabled}
          setJobDescription={setJobDescription}
          handleFileUpload={handleFileUpload}
          handleMatch={handleMatch}
          handleCancel={handleCancel}
          handleClearResume={handleClearResume}
        />
        <MainResultsStage className="mt-2" appState={appState} result={result} progress={progress} />
      </div>
    </div>
  );
}
