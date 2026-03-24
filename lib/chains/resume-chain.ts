import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ResumeSchema } from "../schemas/resume-schema";
import { RootRunCapture, logValidationFailure } from "../langsmith";

const SYSTEM_PROMPT = `You are an expert resume parser. Extract structured information from the resume text provided by the user.

Follow these rules precisely:
- Extract skills as individual atomic items (e.g. "React", "Python", "Docker"). Never group them into categories like "Frontend: React, Vue".
- Calculate totalYearsExperience by summing the years across all experience entries.
- Extract keywords as important technical and domain-specific terms that would be useful for job matching (e.g. "microservices", "agile", "NLP", "REST APIs").
- For years in each experience entry, calculate from date ranges if provided, otherwise estimate from context.
- Only extract information explicitly stated in the resume.

When extracting careerNarrative, read between the lines of the resume.
Do not summarize — infer. What story does the progression of roles tell?
What themes appear across multiple jobs? What does this person move toward?
Where does the resume leave gaps or contradict itself?
Only infer what the evidence supports. Do not invent.

You MUST include the careerNarrative field in every response.
This is not optional. Read the full experience section carefully and infer:
- trajectory: the arc of roles e.g. 'Software Engineer → Tech Lead → Engineering Manager'
- dominantTheme: the consistent domain or problem space across all roles
- inferredStrengths: 3-5 strengths implied by the career progression, not just listed skills
- careerMotivation: what this person seems to move toward based on their choices
- resumeStoryGaps: skills or experiences listed elsewhere that have no supporting evidence in the experience section
Do not skip this field. Do not leave it null.`;

const HUMAN_PROMPT = `Parse the following resume and extract the structured data:

{resume_text}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildResumeChain(model: any) {
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["human", HUMAN_PROMPT],
  ]);

  const structuredModel = model.withStructuredOutput(ResumeSchema);

  return {
    invoke: async (input: { resume_text: string }) => {
      const messages = await prompt.invoke(input);

      let capturedRunId: string | undefined;
      const capture = new RootRunCapture((id) => {
        capturedRunId = id;
      });

      const result = await structuredModel.invoke(messages, {
        runName: "parse-resume",
        callbacks: [capture],
      });

      const validated = ResumeSchema.safeParse(result);
      if (!validated.success) {
        await logValidationFailure({
          runId: capturedRunId,
          nodeName: "parse-resume",
          errors: validated.error,
          rawOutput: result,
        });
        return ResumeSchema.parse({ ...result });
      }

      return validated.data;
    },
  };
}
