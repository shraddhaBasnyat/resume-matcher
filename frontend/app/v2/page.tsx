"use client";

import { Header } from "@/components/layout/Header";
import UploadSection from "@/components/layout/UploadSection";
import { useMatchRunner } from "@/hooks/useMatchRunner";

export default function V2Page() {
  const {
    appState,
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
    <div className="min-h-screen bg-muted/30">
      <Header />
      <div style={{ padding: "8px 24px" }}>
        <UploadSection
          appState={appState}
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
      </div>
    </div>
  );
}
