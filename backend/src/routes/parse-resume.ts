import { Router } from "express";
import multer from "multer";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import PDFParser from "pdf2json";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

router.post("/", upload.single("resume"), async (req, res) => {
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No resume file provided" });
    return;
  }

  if (file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "File must be a PDF" });
    return;
  }

  const tmpPath = join("/tmp", `resume-${Date.now()}.pdf`);

  try {
    await writeFile(tmpPath, file.buffer);

    const rawText = await extractTextFromPdf(tmpPath);
    await unlink(tmpPath).catch(() => {});

    // Light cleanup of common PDF text-extraction artifacts
    const resumeText = rawText
      .replace(/([A-Z])\s(?=[A-Z]\s)/g, "$1")  // fix "S e n i o r" → "Senior"
      .replace(/\b([A-Z])\s([a-z])/g, "$1$2")   // fix "T ech" → "Tech"
      .replace(/\s([A-Z][a-z]{1,2})\b/g, " $1"); // fix "W altham" → "Waltham"

    res.json({ text: resumeText });
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to extract resume text", message });
  }
});

export default router;
