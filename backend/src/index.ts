import "dotenv/config";
import express from "express";
import cors from "cors";
import matchRunRouter from "./routes/match/run.js";
import matchResumeRouter from "./routes/match/resume.js";
import matchAcceptRouter from "./routes/match/accept.js";
import matchCancelRouter from "./routes/match/cancel.js";
import parseResumeRouter from "./routes/parse-resume.js";
import healthRouter from "./routes/health.js";
import { setupCheckpointer } from "../lib/graph/scoring-graph.js";

const app = express();

app.use(cors({
  origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean) as string[],
}));
app.use(express.json());

app.use("/api/match/run", matchRunRouter);
app.use("/api/match/resume", matchResumeRouter);
app.use("/api/match/accept", matchAcceptRouter);
app.use("/api/match/cancel", matchCancelRouter);
app.use("/api/parse-resume", parseResumeRouter);
app.use("/api/health", healthRouter);

const port = process.env.PORT ?? 3001;

setupCheckpointer()
  .then(() => {
    app.listen(port);
  })
  .catch((error) => {
    console.error("Failed to start server: setupCheckpointer() rejected.", {
      error,
      env: {
        PORT: process.env.PORT,
        FRONTEND_URL: process.env.FRONTEND_URL,
        SUPABASE_DB_URL_SET: Boolean(process.env.SUPABASE_DB_URL),
      },
    });
    process.exit(1);
  });
