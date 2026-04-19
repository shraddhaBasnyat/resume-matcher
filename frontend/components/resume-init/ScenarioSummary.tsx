"use client";

interface ScenarioSummaryProps {
  scenario: string;
  text: string;
}

export function ScenarioSummary({ scenario, text }: ScenarioSummaryProps) {
  return (
    <div className="flex flex-row gap-4 px-6 py-5 bg-white border-l-4 border-primary">
      <div className="flex flex-col gap-2">
        <span className="font-semibold text-sm text-foreground">{scenario}</span>
        <p className="text-sm text-foreground font-normal">{text}</p>
      </div>
    </div>
  );
}
