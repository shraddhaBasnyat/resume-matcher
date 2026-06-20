export function formatTerminologyMismatches(
  items: { resumeUses: string; jdExpects: string }[] | undefined,
): string {
  if (!items || items.length === 0) return "(none)";
  return items.map((m) => `- "${m.resumeUses}" → "${m.jdExpects}"`).join("\n");
}
