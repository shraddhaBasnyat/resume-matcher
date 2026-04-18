"use client";

import { useState, RefObject } from "react";
import { FileText, Sparkles, Upload, FileCheck, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadSectionProps {
  appState: "idle" | "running" | "interrupted" | "completed";
  resumeText: string | null;
  jobDescription: string;
  parseLoading: boolean;
  parseError: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  canMatch: boolean;
  setJobDescription: (value: string) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMatch: (e: React.FormEvent) => Promise<void>;
}

export default function UploadSection({
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
}: UploadSectionProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
    handleFileUpload(e);
  }

  if (!isExpanded) {
    return (
      <div
        className="w-full border-b border-border flex flex-row items-center justify-between px-0 py-4 cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        <span className="text-base font-medium text-foreground">Upload Section</span>
        <ChevronDown size={16} className="text-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full border-b border-border flex flex-col items-center gap-6 py-4">
      {/* Cards row */}
      <div className="flex flex-row gap-6 w-full">
        {/* Resume Card */}
        <div className="flex-1 min-w-0 bg-background border border-border/50 shadow-card rounded-none flex flex-col p-0">
          <div className="flex flex-col items-center gap-3 p-6">
            <div className="flex flex-row items-center gap-2">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <FileText size={24} className="text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Resume (PDF)</span>
            </div>

            <div
              className="w-[214px] h-[168px] bg-white border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {parseLoading ? (
                <span className="text-sm text-muted-foreground">Extracting text…</span>
              ) : resumeText ? (
                <div className="flex flex-col items-center gap-1">
                  <FileCheck size={24} className="text-success" />
                  <span className="text-sm font-medium text-foreground">{fileName ?? "resume.pdf"}</span>
                  <span className="text-xs text-muted-foreground">{resumeText?.length ?? 0} characters extracted</span>
                  {/* TODO: add remove/replace file action here */}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center">
                    <Upload size={24} className="text-muted-foreground" />
                  </div>
                  <span className="text-base font-medium text-foreground">Drop your PDF here</span>
                  <span className="text-sm text-muted-foreground">or click to browse</span>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="application/pdf"
              ref={fileInputRef}
              onChange={onFileChange}
              className="hidden"
            />

            {parseError && <p className="text-sm text-destructive">{parseError}</p>}
          </div>
        </div>

        {/* JD Card */}
        <div className="flex-1 min-w-0 bg-background border border-border/50 shadow-card rounded-none flex flex-col p-0">
          <div className="flex flex-col gap-3 p-6">
            <div className="flex flex-row items-center gap-2">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Sparkles size={24} className="text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Job Description</span>
            </div>

            <textarea
              className="w-full bg-muted/30 border border-border/50 rounded-md px-3 py-2 placeholder:text-muted-foreground text-sm text-foreground resize-none"
              style={{ minHeight: "180px" }}
              placeholder="Paste your job description here"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />

            <span className="text-sm text-muted-foreground">{jobDescription.length} characters</span>
          </div>
        </div>
      </div>

      {/* Button row */}
      <div className="flex flex-col items-center gap-2 w-full">
        <form onSubmit={handleMatch}>
          <Button
            type="submit"
            disabled={!canMatch}
            style={{ borderRadius: "6px" }}
          >
            Analyze Match
          </Button>
        </form>
        <div className="cursor-pointer" onClick={() => setIsExpanded(false)}>
          <ChevronUp size={16} className="text-foreground" />
        </div>
      </div>
    </div>
  );
}
