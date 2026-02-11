import type { AssembledPrompt } from "../../types/index.js";
import type { EvaluationEngine, EvaluationResult } from "./types.js";

// minimal shape of the Anthropic SDK surface we use — avoids `any` for a dynamic import
interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      temperature: number;
      system: string;
      messages: { role: string; content: string }[];
    }): Promise<AnthropicMessage>;
  };
}

export class SdkEngine implements EvaluationEngine {
  private apiKey: string;
  // lazily initialized on first evaluate() call; reused for subsequent calls
  private client: AnthropicClient | null = null;

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for SDK engine. Set it via environment variable or pass it directly.",
      );
    }
    this.apiKey = key;
  }

  private async getClient(): Promise<AnthropicClient> {
    if (this.client) return this.client;

    // dynamic import to prevent startup crash when @anthropic-ai/sdk is not installed
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    this.client = new Anthropic({ apiKey: this.apiKey }) as AnthropicClient;
    return this.client;
  }

  async evaluate(prompt: AssembledPrompt): Promise<EvaluationResult> {
    try {
      const client = await this.getClient();

      const response = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        temperature: 0,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock?.text) {
        return { ok: false, error: "No text content in response" };
      }

      return {
        ok: true,
        content: textBlock.text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes("Cannot find package")) {
        return {
          ok: false,
          error:
            "@anthropic-ai/sdk is not installed. Install it with: pnpm add @anthropic-ai/sdk",
        };
      }

      return { ok: false, error: `SDK error: ${message}` };
    }
  }
}
