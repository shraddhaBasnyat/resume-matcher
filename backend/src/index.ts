import "dotenv/config";
import express from "express";
import cors from "cors";
import matchRunRouter from "./routes/match/run.js";
import matchResumeRouter from "./routes/match/resume.js";
import matchAcceptRouter from "./routes/match/accept.js";
import matchCancelRouter from "./routes/match/cancel.js";
import parseResumeRouter from "./routes/parse-resume.js";
import healthRouter from "./routes/health.js";

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
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
