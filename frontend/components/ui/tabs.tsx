"use client";

import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";

function TabsRoot({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Root>) {
  return <Tabs.Root className={cn(className)} {...props} />;
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.List>) {
  return <Tabs.List className={cn(className)} {...props} />;
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Tab>) {
  return <Tabs.Tab className={cn(className)} {...props} />;
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof Tabs.Panel>) {
  return <Tabs.Panel className={cn(className)} {...props} />;
}

export { TabsRoot as Tabs, TabsList, TabsTrigger, TabsContent };
