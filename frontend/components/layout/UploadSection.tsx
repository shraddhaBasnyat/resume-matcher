"use client";

import { useState, RefObject } from "react";
import {
  FileText,
  Sparkles,
  Upload,
  FileCheck,
  Pencil,
  Trash2,
  X,
  LoaderCircle,
} from "lucide-react";
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

interface UploadSectionProps {
  resumeText: string | null;
  jobDescription: string;
  parseLoading: boolean;
  parseError: string | null;
  fileInputRef: RefObject<HTMLInputElement>;
  canMatch: boolean;
  isInputsDisabled: boolean;
  setJobDescription: (value: string) => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleMatch: (e: React.FormEvent) => Promise<void>;
  handleCancel: () => Promise<void>;
  handleClearResume: () => void;
}

export default function UploadSection({
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
}: UploadSectionProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isJDOpen, setIsJDOpen] = useState(false);

  const isRunning = isInputsDisabled;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
    handleFileUpload(e);
  }

  function onClearResume() {
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    handleClearResume();
  }

  const cardBase =
    "bg-background rounded-xl flex flex-row items-center py-2 px-4 gap-3";
  const resumeCardBorder =
    isRunning || resumeText !== null
      ? "border-2 border-border"
      : "border-2 border-dashed border-border";
  const jdCardBorder =
    isRunning || jobDescription.trim() !== ""
      ? "border-2 border-border"
      : "border-2 border-dashed border-border";
  return (
    <div className="sticky top-[88px] z-10 w-full bg-muted">
      <div className="flex flex-row gap-6 py-2">
        {/* Cards — dimmed and non-interactive while running */}
        <div className={`flex flex-row gap-6 flex-1 min-w-0${isRunning ? " opacity-40 pointer-events-none" : ""}`}>
        {/* Resume Card */}
        <div className="flex-1 min-w-0">
          <div
            className={`${cardBase} ${resumeCardBorder} cursor-pointer`}
            onClick={() => fileInputRef.current?.click()}
          >
            {/* Left icon */}
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <FileText size={16} className="text-primary" />
            </div>

            {/* Middle content */}
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-xs font-semibold text-foreground">
                Resume (PDF)
              </span>
              {parseLoading ? (
                <span className="text-xs text-muted-foreground">Extracting text…</span>
              ) : resumeText ? (
                <div className="flex items-center gap-1.5">
                  <FileCheck size={14} className="text-success shrink-0" />
                  <span className="text-xs text-foreground truncate">
                    {fileName ?? "resume.pdf"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    · {resumeText.length} chars
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Upload size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-light text-muted-foreground">
                    Click to browse or drop PDF
                  </span>
                </div>
              )}
              {parseError && (
                <span className="text-xs text-destructive">{parseError}</span>
              )}
            </div>

            {/* Right action */}
            {resumeText && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClearResume(); }}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Remove resume"
              >
                <Trash2 size={16} className="text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        <input
          type="file"
          accept="application/pdf"
          ref={fileInputRef}
          onChange={onFileChange}
          className="hidden"
        />

        {/* JD Card */}
        <div className="flex-1 min-w-0">
          <div className={`${cardBase} ${jdCardBorder}`}>
            {/* Left icon — clicking opens dialog */}
            <div
              className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 cursor-pointer"
              onClick={() => setIsJDOpen(true)}
            >
              <Sparkles size={16} className="text-primary" />
            </div>

            {/* Middle content — clicking opens dialog */}
            <div
              className="flex flex-col gap-0.5 flex-1 min-w-0 cursor-pointer"
              onClick={() => setIsJDOpen(true)}
            >
              <span className="text-xs font-semibold text-foreground">
                Job Description
              </span>
              {jobDescription.trim() ? (
                <span className="text-xs text-foreground truncate">
                  {jobDescription}
                </span>
              ) : (
                <span className="text-xs font-light text-muted-foreground">
                  Click to add job description…
                </span>
              )}
            </div>

            {/* Right action — clear if filled, open dialog if empty */}
            <button
              type="button"
              onClick={() => {
                if (jobDescription.trim()) {
                  setJobDescription("");
                } else {
                  setIsJDOpen(true);
                }
              }}
              className="w-8 h-8 rounded-full bg-muted flex items-center justify-center cursor-pointer shrink-0"
              aria-label={jobDescription.trim() ? "Clear job description" : "Add job description"}
            >
              {jobDescription.trim() ? (
                <Trash2 size={16} className="text-muted-foreground" />
              ) : (
                <Pencil size={16} className="text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
        </div>{/* end cards wrapper */}

        {/* Action column */}
        <div className="flex flex-col items-center justify-center shrink-0 px-2">
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[6px] bg-primary text-primary-foreground cursor-pointer"
            >
              <LoaderCircle size={16} className="animate-spin" />
              Cancel
            </button>
          ) : (
            <form onSubmit={handleMatch}>
              <button
                type="submit"
                disabled={!canMatch}
                className={[
                  "px-4 py-2 text-sm font-medium rounded-[6px] transition-colors",
                  canMatch
                    ? "bg-primary text-primary-foreground cursor-pointer"
                    : "bg-primary/10 text-primary cursor-not-allowed",
                ].join(" ")}
              >
                Analyze Match
              </button>
            </form>
          )}
        </div>
      </div>

      {/* JD Dialog */}
      <Dialog open={isJDOpen} onOpenChange={setIsJDOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <div className="flex items-center gap-3 relative">
              <div className="w-10 h-10 bg-primary/10 rounded-[8px] flex items-center justify-center shrink-0">
                <Sparkles size={16} className="text-primary" />
              </div>
              <DialogTitle>Job Description</DialogTitle>
              <DialogClose aria-label="Close">
                <X size={16} />
              </DialogClose>
            </div>

            <textarea
              className="w-full bg-muted border border-border/50 rounded-[6px] px-3 py-2 placeholder:text-muted-foreground text-sm text-foreground resize-y outline-none focus:border-border"
              style={{ minHeight: "180px" }}
              placeholder="Paste your job description here"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              autoFocus
            />

            <span className="text-sm font-light text-muted-foreground">
              {jobDescription.length} characters
            </span>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsJDOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-[6px] bg-primary text-primary-foreground cursor-pointer"
              >
                Confirm
              </button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
