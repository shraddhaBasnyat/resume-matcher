import "dotenv/config";
import express from "express";
import cors from "cors";
import { setupCheckpointer } from "../graphs/scoring/scoring-graph.js";
import { requireAuth } from "./middleware/requireAuth.js";

const app = express();

app.use(cors({
  origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(Boolean) as string[],
}));
app.use(express.json());

const port = process.env.PORT ?? 3001;

setupCheckpointer()
  .then(async () => {
    const { default: matchRunRouter } = await import("./routes/match/run.js");
    const { default: matchResumeRouter } = await import("./routes/match/resume.js");
    const { default: matchAcceptRouter } = await import("./routes/match/accept.js");
    const { default: matchCancelRouter } = await import("./routes/match/cancel.js");
    const { default: parseResumeRouter } = await import("./routes/parse-resume.js");
    const { default: healthRouter } = await import("./routes/health.js");

    app.use("/api/match/run", requireAuth, matchRunRouter);
    app.use("/api/match/resume", requireAuth, matchResumeRouter);
    app.use("/api/match/accept", requireAuth, matchAcceptRouter);
    app.use("/api/match/cancel", requireAuth, matchCancelRouter);
    app.use("/api/parse-resume", requireAuth, parseResumeRouter);
    app.use("/api/health", healthRouter);

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