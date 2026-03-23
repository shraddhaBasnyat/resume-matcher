import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import PDFParser from "pdf2json";

function extractTextFromPdf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parser.on("pdfParser_dataError", (err: any) => reject(err.parserError ?? err));
    parser.on("pdfParser_dataReady", (data) => {
      const text = data.Pages.map((page) =>
        page.Texts.map((t) => {
          try {
            return decodeURIComponent(t.R.map((r) => r.T).join(""));
          } catch {
            return t.R.map((r) => r.T).join("");
          }
        }).join(" ")
      ).join("\n");
      resolve(text);
    });
    parser.loadPDF(filePath);
  });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("resume") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No resume file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }

  const tmpPath = join("/tmp", `resume-${Date.now()}.pdf`);

  try {
    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    const rawText = await extractTextFromPdf(tmpPath);
    await unlink(tmpPath).catch(() => {});

    // Light cleanup of common PDF text-extraction artifacts
    const resumeText = rawText
      .replace(/([A-Z])\s(?=[A-Z]\s)/g, "$1")  // fix "S e n i o r" → "Senior"
      .replace(/\b([A-Z])\s([a-z])/g, "$1$2")   // fix "T ech" → "Tech"
      .replace(/\s([A-Z][a-z]{1,2})\b/g, " $1"); // fix "W altham" → "Waltham"

    return NextResponse.json({ text: resumeText });
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Failed to extract resume text", message }, { status: 500 });
  }
}
