/**
 * Parse the --tier CLI flag value into the evaluator's tierFilter type.
 * Returns null if the value is invalid.
 */
export function parseTierFlag(value: string): number | "all" | null {
  if (value === "all") return "all";
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return null;
}
