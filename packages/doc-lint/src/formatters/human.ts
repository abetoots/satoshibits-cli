import type { ChalkInstance } from "chalk";
import type { AssembleResult, LintResult, Finding, ContradictionFinding } from "../types/index.js";

type ChalkColor = "red" | "yellow" | "blue";

export async function formatAssembleHuman(result: AssembleResult): Promise<string> {
  const chalk = (await import("chalk")).default;
  const lines: string[] = [];

  lines.push(chalk.bold(`doc-lint assemble: ${result.project}`));
  lines.push(chalk.dim(`Signals: ${result.signals.join(", ")}`));
  lines.push("");

  lines.push(`Matched concerns: ${chalk.green(String(result.concerns.matched.length))}`);
  for (const id of result.concerns.matched) {
    lines.push(`  ${chalk.green("+")} ${id}`);
  }

  if (result.concerns.skipped.length > 0) {
    lines.push(`Skipped concerns: ${chalk.dim(String(result.concerns.skipped.length))}`);
    for (const id of result.concerns.skipped) {
      lines.push(`  ${chalk.dim("-")} ${id}`);
    }
  }

  lines.push("");
  lines.push(`Total prompts assembled: ${chalk.bold(String(result.prompts.length))}`);

  return lines.join("\n");
}

export async function formatLintHuman(result: LintResult): Promise<string> {
  const chalk = (await import("chalk")).default;
  const lines: string[] = [];

  lines.push(chalk.bold(`doc-lint: ${result.project}`));
  lines.push(chalk.dim(`Signals: ${result.signals.join(", ")}`));
  lines.push(chalk.dim(`Concerns evaluated: ${result.concerns.matched.join(", ")}`));
  lines.push("");

  // group findings by severity
  const errors = result.findings.filter((f) => f.severity === "error");
  const warnings = result.findings.filter((f) => f.severity === "warn");
  const notes = result.findings.filter((f) => f.severity === "note");

  if (errors.length > 0) {
    lines.push(chalk.red.bold(`ERRORS (${errors.length})`));
    lines.push(chalk.red("─".repeat(60)));
    for (const finding of errors) {
      lines.push(formatFinding(chalk, finding, "red"));
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push(chalk.yellow.bold(`WARNINGS (${warnings.length})`));
    lines.push(chalk.yellow("─".repeat(60)));
    for (const finding of warnings) {
      lines.push(formatFinding(chalk, finding, "yellow"));
    }
    lines.push("");
  }

  if (notes.length > 0) {
    lines.push(chalk.blue.bold(`NOTES (${notes.length})`));
    lines.push(chalk.blue("─".repeat(60)));
    for (const finding of notes) {
      lines.push(formatFinding(chalk, finding, "blue"));
    }
    lines.push("");
  }

  // contradictions
  if (result.contradictions.length > 0) {
    lines.push(chalk.magenta.bold(`CONTRADICTIONS (${result.contradictions.length})`));
    lines.push(chalk.magenta("─".repeat(60)));
    for (const c of result.contradictions) {
      lines.push(formatContradiction(chalk, c));
    }
    lines.push("");
  }

  // summary
  lines.push(chalk.bold("SUMMARY"));
  lines.push("─".repeat(60));
  const s = result.summary;
  lines.push(`  Total findings: ${s.totalFindings}`);
  if (s.errors > 0) lines.push(chalk.red(`  Errors: ${s.errors}`));
  if (s.warnings > 0) lines.push(chalk.yellow(`  Warnings: ${s.warnings}`));
  if (s.notes > 0) lines.push(chalk.blue(`  Notes: ${s.notes}`));
  if (s.contradictions > 0) lines.push(chalk.magenta(`  Contradictions: ${s.contradictions}`));
  if (s.humanReviewRequired > 0) {
    lines.push(chalk.red(`  Human review required: ${s.humanReviewRequired}`));
  }

  if (s.errors > 0) {
    lines.push("");
    lines.push(chalk.red.bold("RESULT: FAIL"));
  } else if (s.warnings > 0) {
    lines.push("");
    lines.push(chalk.yellow.bold("RESULT: PASS (with warnings)"));
  } else {
    lines.push("");
    lines.push(chalk.green.bold("RESULT: PASS"));
  }

  return lines.join("\n");
}

function formatFinding(chalk: ChalkInstance, finding: Finding, color: ChalkColor): string {
  const colorFn = chalk[color];
  const lines: string[] = [];
  lines.push(colorFn(`  [${finding.id}] ${finding.description}`));
  lines.push(`    Concern: ${finding.concernId}`);
  lines.push(`    Confidence: ${finding.confidence}`);
  lines.push(`    Risk: ${finding.risk}`);
  lines.push(`    Recommendation: ${finding.recommendation}`);
  if (finding.requiresHumanReview) {
    lines.push(chalk.red("    ** Requires human review **"));
  }
  return lines.join("\n");
}

function formatContradiction(chalk: ChalkInstance, c: ContradictionFinding): string {
  const lines: string[] = [];
  const severityColor: ChalkColor = c.severity === "error" ? "red" : c.severity === "warn" ? "yellow" : "blue";
  const colorFn = chalk[severityColor];
  lines.push(colorFn(`  [${c.id}] ${c.conflictType} conflict`));
  lines.push(`    A: "${c.statementA.text}" (${c.statementA.location})`);
  lines.push(`    B: "${c.statementB.text}" (${c.statementB.location})`);
  lines.push(`    ${c.explanation}`);
  return lines.join("\n");
}
