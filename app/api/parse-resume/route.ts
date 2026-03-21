import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import PDFParser from "pdf2json";
import { ChatOllama } from "@langchain/ollama";
import { buildResumeChain } from "@/lib/resume-chain";

function extractTextFromPdf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parser = new PDFParser();
    parser.on("pdfParser_dataError", (err) => reject(err.parserError));
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

    const resumeText = await extractTextFromPdf(tmpPath);
    await unlink(tmpPath).catch(() => {});

    const model = new ChatOllama({ model: "llama3.2" });
    const chain = buildResumeChain(model);
    const result = await chain.invoke({ resume_text: resumeText });

    return NextResponse.json(result);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});

    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("ECONNREFUSED") ||
      message.includes("fetch failed") ||
      message.includes("connect ECONNREFUSED")
    ) {
      return NextResponse.json(
        {
          error: "Ollama is unreachable",
          message:
            "Could not connect to Ollama. Make sure Ollama is running locally (`ollama serve`) and the llama3.2 model is pulled (`ollama pull llama3.2`).",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Failed to parse resume", message }, { status: 500 });
  }
}
