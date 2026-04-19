"use client";

import { Header } from "@/components/layout/Header";
import UploadSection from "@/components/layout/UploadSection";
import { MainResultsStage } from "@/components/resume-init/MainResultsStage";
import { useMatchRunner } from "@/hooks/useMatchRunner";

export default function V2Page() {
  const {
    resumeText,
    jobDescription,
    parseLoading,
    parseError,
    fileInputRef,
    canMatch,
    setJobDescription,
    handleFileUpload,
    handleMatch,
  } = useMatchRunner();

  return (
    <div className="min-h-screen bg-muted/50">
      <Header />
      <div style={{ padding: "8px 24px" }}>
        <UploadSection
          resumeText={resumeText}
          jobDescription={jobDescription}
          parseLoading={parseLoading}
          parseError={parseError}
          fileInputRef={fileInputRef}
          canMatch={canMatch}
          setJobDescription={setJobDescription}
          handleFileUpload={handleFileUpload}
          handleMatch={handleMatch}
        />
        <MainResultsStage className="mt-2" />
      </div>
    </div>
  );
}
