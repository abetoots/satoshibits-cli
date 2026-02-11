import type { AssembleResult, LintResult } from "../types/index.js";

export function formatAssembleJson(result: AssembleResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatLintJson(result: LintResult): string {
  return JSON.stringify(result, null, 2);
}
