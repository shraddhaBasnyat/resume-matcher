// TODO: delete this file and replace imports with useMatchRunner completed event data

import type { StepperNode } from "./Stepper";

export const DUMMY_NODES: StepperNode[] = [
  { id: "parse-resume", label: "Parsing Resume", status: "done", durationMs: 9100 },
  { id: "parse-job",    label: "Parsing Job",    status: "done", durationMs: 9100 },
  { id: "score-match",  label: "Scoring Match",  status: "done", durationMs: 9100 },
  { id: "analyze-gap",  label: "Analyzing Gap",  status: "done", durationMs: 9100 },
];

export const DUMMY_BATTLE_CARD = {
  score: 72,
  headline: "Elite Technical Lead with Deep E-commerce DNA",
  bulletPoints: [
    "The Edge: Fast-tracked from SE to Staff/Tech Lead at Wayfair, managed 10+ engineers while maintaining deep hands-on micro services influence.",
    "Domain Expertise: Rare \"Storefront Core\" experience—architected product search, CMS, and page load optimization at massive scale.",
    "The Bridge: Profile undersells IaC (Terraform) and Java/OOP fluency—critical for ATS visibility despite her proven architectural facility.",
  ],
};

export const DUMMY_FIT_ADVICE: { key: string; bulletPoints: string[] }[] = [
  {
    key: "transferable_strengths",
    bulletPoints: [
      "Legacy system modernization at scale (PHP monolith to microservices replatforming) — directly transferable to evolving Chewy's fulfillment automation infrastructure",
      "Distributed systems and microservices architecture (explicit in tech lead roles managing Storefront Dynamic Infrastructure and cross-funnel services)",
      "Multi-level technical leadership: simultaneous individual contribution and mentorship (Tech Lead + Staff Engineer roles with code review ownership implied)",
      "Cross-team coordination and execution (Tech Lead, Storefront Core Funnel required managing dependencies across search, browse, and dynamic infrastructure domains)",
      "Real-time, high-concurrency system design (storefront personalization and dynamic context handling in e-commerce environment with scale similar to Chewy)",
      "Object-oriented design and systems architecture (foundational to microservices work; M.A. in Computer Science demonstrates formal training)",
      "Java and GraphQL expertise (core Chewy backend languages; GraphQL and API-driven architecture are patterns Chewy modernization efforts likely require)",
    ],
  },
  {
    key: "reframing_suggestions",
    bulletPoints: [
      "Reframe your Storefront Dynamic Infrastructure tech lead role as 'Owned architectural evolution of high-scale backend services handling real-time personalization and fulfillment-adjacent workflow orchestration'—explicitly connect the infrastructure modernization work to fulfillment automation patterns (context-aware routing, state management across distributed services).",
      "When discussing your monolith-to-microservices transition at Wayfair, add: 'Led migration strategy and code review standards for Java microservices replacing legacy PHP systems, establishing patterns for service boundaries, API contracts, and deployment automation'—this foregrounds the Java + infrastructure thinking Chewy values.",
      "Position your Tech Lead and Staff Engineer roles as 'Technical leadership with hands-on ownership: responsible for both architecture decisions and code-level execution, mentoring senior engineers through complex system redesigns'—explicitly name the dual responsibility (not sequential manager-then-IC, but simultaneous technical authority and development).",
      "Add one sentence to any role description: 'Worked within CI/CD-enabled development practices [or whatever pipeline names you used—GitLab, GitHub Actions, etc.] to ensure rapid, safe deployment of distributed services'—this surfaces that you have pipeline experience even if the specific tool name (Jenkins) wasn't your platform.",
      "When describing any Python or Kotlin exposure (even if limited to scripts, utilities, or learning), surface it explicitly: 'Contributed [scripts/utilities/migrations] in Python' or 'evaluated Kotlin for microservices migration'—do not leave these gaps blank if any work exists, even adjacent.",
    ],
  },
  {
    key: "upskill_gaps",
    bulletPoints: [
      "Kotlin—no evidence of use; Java is your primary OO language and Kotlin syntax is learnable for someone with your Java depth, but this is a gap.",
      "Python—not evidenced in your resume; this is a real gap, though your Java and systems design background makes it an acquisition task, not a foundational one.",
      "Terraform or explicit infrastructure-as-code tooling—your modernization narrative implies infrastructure work, but IaC tooling is not named.",
      "Jenkins or explicit CI/CD orchestration tool naming—you likely have pipeline experience, but the absence of Jenkins, GitLab CI, or GitHub Actions naming is a gap.",
    ],
  },
  {
    key: "ats_profile",
    bulletPoints: [
      "Resume uses 'microservices' generically; job posting emphasizes 'distributed systems' and 'large-scale workflows'",
      "Resume uses 'technical writing' and 'systems design'; job posting requires specific emphasis on 'designing software services and/or components and architecture'",
      "Resume uses 'replatforming strategy' and 'Apollo Federated GraphQL'; job posting emphasizes 'high-performance, distributed systems'",
      "Resume uses 'Java microservices' and 'legacy PHP monolith'; job posting requires Java but also Kotlin and Python proficiency",
      "Resume does not mention 'Terraform' and 'Jenkins' - critical infrastructure tools for the role",
    ],
  },
];

export const DUMMY_NARRATIVE_BRIDGE = {
  scenario: "Narrative Gap",
  text: "Shraddha's seven years at Wayfair navigating the transformation from PHP monoliths to microservices architectures—across storefront core funnel, search, and dynamic infrastructure—is directly analogous to the distributed systems and operational excellence Chewy demands at fulfillment scale. Her progression from Software Engineer through dual Tech Lead roles (managing cross-functional initiatives while coding) to Staff Engineer mirrors the technical authority and mentorship bridge Chewy seeks: she has repeatedly owned high-stakes architectural decisions, led code review cultures, and scaled systems that required both deep systems thinking and the ability to elevate entire teams. The gap isn't capability—it's toolkit visibility. Python and Kotlin are learnable syntax; the harder problem—architecting for scale, handling concurrency and state in distributed workflows, mentoring through technical complexity—she has already solved at a company whose infrastructure demands rival Chewy's.",
};
