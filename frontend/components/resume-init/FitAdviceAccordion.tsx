"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDown } from "lucide-react";

interface FitAdviceAccordionProps {
  isLoading: boolean;
  items?: {
    question: string;
    bulletPoints: string[]; // count used for summary line, array rendered as list in panel
  }[];
}

export function FitAdviceAccordion({ isLoading, items }: FitAdviceAccordionProps) {
  return (
    <div className="flex flex-col p-6 bg-white w-full">
      {isLoading ? (
        [0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-row justify-between items-center py-4 border-b border-border gap-[18px]"
          >
            <div className="flex flex-row items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-muted shrink-0" />
              <div className="flex flex-col gap-2">
                <div className="w-[250px] h-[16px] bg-muted rounded-[6px]" />
                <div className="w-[200px] h-[16px] bg-muted rounded-[6px]" />
              </div>
            </div>
            <ChevronDown size={16} className="text-foreground shrink-0" />
          </div>
        ))
      ) : (
        <Accordion.Root defaultValue={[]} multiple={false}>
          {items?.map((item, i) => (
            <Accordion.Item key={i} value={i}>
              <Accordion.Header>
                <Accordion.Trigger className="flex flex-row justify-between items-center py-4 border-b border-border gap-[18px] w-full bg-transparent group">
                  <div className="flex flex-row items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary shrink-0" />
                    <div className="flex flex-col gap-2 text-left">
                      <span className="text-sm text-foreground font-normal">{item.question}</span>
                      <span className="text-sm text-foreground font-normal">
                        {item.bulletPoints.length} items found
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className="text-foreground shrink-0 transition-transform group-data-[panel-open]:rotate-180"
                  />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Panel className="py-2">
                <ul className="list-disc pl-5 flex flex-col gap-1">
                  {item.bulletPoints.map((point, j) => (
                    <li key={j} className="text-sm text-foreground font-normal">
                      {point}
                    </li>
                  ))}
                </ul>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      )}
    </div>
  );
}
