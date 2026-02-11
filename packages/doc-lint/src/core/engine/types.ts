import type { AssembledPrompt } from "../../types/index.js";

export type EvaluationResult =
  | { ok: true; content: string; usage?: { inputTokens: number; outputTokens: number } }
  | { ok: false; error: string };

export interface EvaluationEngine {
  evaluate(prompt: AssembledPrompt): Promise<EvaluationResult>;
}
