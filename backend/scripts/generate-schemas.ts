import { zodToJsonSchema } from "zod-to-json-schema";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { AnalyzeFitLLMSchema } from "../schemas/analyze-fit.schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const schema = zodToJsonSchema(AnalyzeFitLLMSchema, "AnalyzeFitLLMSchema");
writeFileSync(
  join(__dirname, "../schemas/analyze-fit.schema.json"),
  JSON.stringify(schema, null, 2) + "\n",
  "utf-8",
);
