import { loadAllConcerns } from "../core/concerns.js";

import type { LoadedConcern } from "../types/index.js";

const CATEGORY_ORDER = [
  "core",
  "promise-validation",
  "security",
  "operational",
  "compliance",
  "test-coverage",
];

function titleCase(category: string): string {
  return category
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function formatList(concerns: LoadedConcern[]): string {
  const lines: string[] = [];

  lines.push("Bundled Concerns\n");

  const interactions = concerns.filter((c) => c.type === "interaction");
  const nonInteractions = concerns.filter((c) => c.type !== "interaction");

  // group non-interaction concerns by category
  const byCategory = new Map<string, LoadedConcern[]>();
  for (const c of nonInteractions) {
    const group = byCategory.get(c.category) ?? [];
    group.push(c);
    byCategory.set(c.category, group);
  }

  // render in defined order, skip empty categories
  for (const category of CATEGORY_ORDER) {
    const group = byCategory.get(category);
    if (!group || group.length === 0) continue;

    lines.push(`${titleCase(category)} (${group.length}):`);
    for (const c of group) {
      lines.push(`  ${c.id} v${c.version}`);
      lines.push(`    ${c.name}`);
      lines.push(`    Severity: ${c.severity}`);
      lines.push(`    Triggers (any_of): ${c.triggerSignals.join(", ")}`);
      lines.push("");
    }
  }

  if (interactions.length > 0) {
    lines.push(`Interaction Matrices (${interactions.length}):`);
    for (const c of interactions) {
      lines.push(`  ${c.id} v${c.version}`);
      lines.push(`    ${c.name}`);
      lines.push(`    Severity: ${c.severity}`);
      lines.push(`    Triggers (all_of): ${c.triggerSignals.join(", ")}`);
      lines.push("");
    }
  }

  lines.push(`Total: ${concerns.length} concerns`);

  return lines.join("\n");
}

export async function listCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;

  const concerns = loadAllConcerns();
  const plain = formatList(concerns);

  // colorize the plain output: bold header, green IDs
  const colored = plain
    .replace(/^Bundled Concerns/m, chalk.bold("Bundled Concerns"))
    .replace(/^(.+ \(\d+\):)$/gm, (match) => chalk.underline(match))
    .replace(/^( {2}\S+ v\S+)$/gm, (match) => `  ${chalk.green(match.trim())}`);

  console.log(colored);
}
