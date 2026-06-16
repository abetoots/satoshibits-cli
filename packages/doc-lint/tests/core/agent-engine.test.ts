import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  FileTools,
  resolveSandboxPath,
  runAgentLoop,
} from "../../src/core/engine/agent-engine.js";

import type { AgentMessage, ToolUseClient } from "../../src/core/engine/agent-engine.js";
import type { CompletenessPolicy, EvaluationContext } from "../../src/core/engine/types.js";
import type { AssembledPrompt } from "../../src/types/index.js";

// ---------------------------------------------------------------------------
// fixtures: a tiny repo + helpers to script a fake Anthropic tool-use client.
// realpath the tmp root so coverage's relative paths stay canonical on macOS.
// ---------------------------------------------------------------------------

function makeContext(
  root: string,
  allowedReadRoots: string[] = [root],
  completeness?: CompletenessPolicy,
): EvaluationContext {
  return {
    projectRoot: root,
    sources: [{ kind: "code", path: "src" }],
    sandbox: {
      mode: "read-only",
      allowExecution: false,
      allowNetwork: false,
      allowedReadRoots,
    },
    completeness: completeness ?? {
      requireEnumeration: true,
      requireAdversarialVerify: false,
      minSourcesRead: "all",
    },
  };
}

const PROMPT: AssembledPrompt = {
  concernId: "test-concern",
  concernVersion: "1.0",
  concernName: "Test Concern",
  type: "concern",
  system: "You are a validator.",
  user: "Evaluate the concern.",
  responseSchema: {},
  metadata: { documentsIncluded: [], templateVersion: "1.0" },
};

function msg(content: AgentMessage["content"], stop: string): AgentMessage {
  return { content, stop_reason: stop, usage: { input_tokens: 10, output_tokens: 5 } };
}
function toolUse(id: string, name: string, input: Record<string, unknown>): AgentMessage {
  return msg([{ type: "tool_use", id, name, input }], "tool_use");
}
function final(text: string): AgentMessage {
  return msg([{ type: "text", text }], "end_turn");
}

// scripted client: returns queued responses; clamps to the last (so an
// "always tool_use" script drives the loop into its turn limit).
function scriptedClient(responses: AgentMessage[]): ToolUseClient & { callCount: number } {
  const state = { callCount: 0 };
  return {
    get callCount() {
      return state.callCount;
    },
    messages: {
      create(_params) {
        const r = responses[Math.min(state.callCount, responses.length - 1)]!;
        state.callCount++;
        return Promise.resolve(r);
      },
    },
  };
}

describe("agent-engine sandbox", () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-agent-")));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/http.ts"), "app.post('/charge', handler);\n");
    fs.writeFileSync(path.join(root, "secret.env"), "API_KEY=super-secret\n");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("allows reads inside an allowed root", () => {
    const ctx = makeContext(root, [path.join(root, "src")]);
    const r = resolveSandboxPath(ctx, "src/http.ts");
    expect(r.ok).toBe(true);
  });

  it("refuses reads outside the allowed root", () => {
    const ctx = makeContext(root, [path.join(root, "src")]);
    const r = resolveSandboxPath(ctx, "secret.env");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/permission denied/i);
  });

  it("refuses `..` traversal escapes", () => {
    const ctx = makeContext(root, [path.join(root, "src")]);
    const r = resolveSandboxPath(ctx, "src/../secret.env");
    expect(r.ok).toBe(false);
  });

  it("FileTools.read_file returns a permission error and records it as unreadable", () => {
    const ctx = makeContext(root, [path.join(root, "src")]);
    const tools = new FileTools(ctx);
    const out = tools.execute("read_file", { path: "secret.env" });
    expect(out).toMatch(/permission denied/i);
    expect(out).not.toContain("super-secret"); // content never leaks
    expect(tools.coverage().unreadable?.length).toBeGreaterThan(0);
  });

  it("FileTools.read_file returns content and records filesRead inside the root", () => {
    const ctx = makeContext(root);
    const tools = new FileTools(ctx);
    const out = tools.execute("read_file", { path: "src/http.ts" });
    expect(out).toContain("/charge");
    expect(tools.coverage().filesRead).toContain("src/http.ts");
  });

  it("FileTools.grep enumerates matches as file:line and counts as a search", () => {
    const ctx = makeContext(root);
    const tools = new FileTools(ctx);
    const out = tools.execute("grep", { pattern: "/charge" });
    expect(out).toContain("src/http.ts:1");
    expect(tools.coverage().searchesPerformed.length).toBeGreaterThan(0);
  });

  it("grep does NOT follow a symlink that escapes the sandbox", () => {
    // src/leak -> ../secret.env (outside the allowed root [root/src])
    fs.symlinkSync(path.join(root, "secret.env"), path.join(root, "src/leak"));
    const ctx = makeContext(root, [path.join(root, "src")]);
    const tools = new FileTools(ctx);
    const out = tools.execute("grep", { pattern: "super-secret", path: "src" });
    expect(out).toBe("(no matches)"); // the symlinked secret is never read
    expect(out).not.toContain("super-secret");
  });

  it("grep does NOT descend into a symlinked directory that escapes the sandbox", () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-outside-"));
    fs.writeFileSync(path.join(outside, "leak.ts"), "const token = 'ESCAPED';\n");
    // src/up -> <outside dir>
    fs.symlinkSync(outside, path.join(root, "src/up"));
    const ctx = makeContext(root, [path.join(root, "src")]);
    const tools = new FileTools(ctx);
    const out = tools.execute("grep", { pattern: "ESCAPED", path: "src" });
    expect(out).toBe("(no matches)");
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it("grep honors path-glob ignore patterns, not just segment names", () => {
    fs.mkdirSync(path.join(root, "src/skip"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/skip/x.ts"), "const tok = 'NEEDLE';\n");
    fs.writeFileSync(path.join(root, "src/keep.ts"), "const tok = 'NEEDLE';\n");
    const ctx: EvaluationContext = {
      ...makeContext(root),
      sandbox: { ...makeContext(root).sandbox, ignore: ["**/skip/**"] },
    };
    const tools = new FileTools(ctx);
    const out = tools.execute("grep", { pattern: "NEEDLE" });
    expect(out).toContain("src/keep.ts");
    expect(out).not.toContain("src/skip");
  });

  it("grep rejects an over-long pattern (backtracking-DoS guard)", () => {
    const ctx = makeContext(root);
    const tools = new FileTools(ctx);
    const out = tools.execute("grep", { pattern: "a".repeat(500) });
    expect(out).toMatch(/pattern too long/i);
  });
});

describe("agent-engine loop", () => {
  let root: string;

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "doc-lint-agent-loop-")));
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "src/http.ts"), "app.post('/charge', handler);\n");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("enumerates before concluding → coverage flows through as complete", async () => {
    const client = scriptedClient([
      toolUse("t1", "grep", { pattern: "charge" }),
      toolUse("t2", "read_file", { path: "src/http.ts" }),
      final('{"gaps": []}'),
    ]);
    const res = await runAgentLoop(client, PROMPT, makeContext(root));

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.content).toBe('{"gaps": []}');
    expect(res.coverage?.searchesPerformed.length).toBeGreaterThan(0);
    expect(res.coverage?.filesRead).toContain("src/http.ts");
    expect(res.coverage?.toolTurnCount).toBe(2);
    expect(res.coverage?.completeness).toBe("complete");
  });

  it("concluding WITHOUT enumerating is reported as partial", async () => {
    const client = scriptedClient([final('{"gaps": []}')]);
    const res = await runAgentLoop(client, PROMPT, makeContext(root));
    expect(res.ok).toBe(true);
    expect(res.coverage?.completeness).toBe("partial");
    expect(res.coverage?.searchesPerformed).toHaveLength(0);
  });

  it("hitting the turn limit is reported as insufficient", async () => {
    // always asks for a tool, never ends → loop exhausts maxTurns
    const client = scriptedClient([toolUse("t1", "grep", { pattern: "x" })]);
    const res = await runAgentLoop(client, PROMPT, makeContext(root), { maxTurns: 2 });
    expect(res.ok).toBe(false); // never produced final text
    expect(res.coverage?.completeness).toBe("insufficient");
    expect(client.callCount).toBe(2);
  });

  it("NEVER returns ok:true on a turn-limit abort, even with trailing text", async () => {
    // model keeps emitting planning text alongside a tool call, never a clean stop
    const planning: AgentMessage = msg(
      [
        { type: "text", text: "Let me look at one more file before I answer..." },
        { type: "tool_use", id: "t1", name: "read_file", input: { path: "src/http.ts" } },
      ],
      "tool_use",
    );
    const client = scriptedClient([planning]);
    const res = await runAgentLoop(client, PROMPT, makeContext(root), { maxTurns: 2 });
    expect(res.ok).toBe(false); // planning chatter must not be returned as the final answer
    if (!res.ok) expect(res.error).toMatch(/turn limit/i);
    expect(res.coverage?.completeness).toBe("insufficient");
  });

  it("does not treat text emitted alongside a tool_use as the final answer", async () => {
    // turn 1 has both chatter + a tool call; turn 2 is the real final JSON
    const chatterThenTool: AgentMessage = msg(
      [
        { type: "text", text: "thinking out loud, not my answer" },
        { type: "tool_use", id: "t1", name: "read_file", input: { path: "src/http.ts" } },
      ],
      "tool_use",
    );
    const client = scriptedClient([chatterThenTool, final('{"gaps": []}')]);
    const res = await runAgentLoop(client, PROMPT, makeContext(root));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toBe('{"gaps": []}'); // not the chatter
  });

  it("an out-of-sandbox read during the loop downgrades completeness to partial", async () => {
    fs.writeFileSync(path.join(root, "secret.env"), "API_KEY=x\n");
    const ctx = makeContext(root, [path.join(root, "src")]);
    const client = scriptedClient([
      toolUse("t1", "grep", { pattern: "charge", path: "src" }),
      toolUse("t2", "read_file", { path: "secret.env" }), // refused → unreadable
      final('{"gaps": []}'),
    ]);
    const res = await runAgentLoop(client, PROMPT, ctx);
    expect(res.ok).toBe(true);
    expect(res.coverage?.unreadable?.length).toBeGreaterThan(0);
    expect(res.coverage?.completeness).toBe("partial");
  });

  it("feeds tool results back to the client across turns", async () => {
    const client = scriptedClient([
      toolUse("t1", "read_file", { path: "src/http.ts" }),
      final('{"gaps": []}'),
    ]);
    await runAgentLoop(client, PROMPT, makeContext(root));
    // 2 model calls: initial + one after the tool result
    expect(client.callCount).toBe(2);
  });
});
