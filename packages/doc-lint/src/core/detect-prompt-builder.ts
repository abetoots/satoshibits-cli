import { SIGNAL_KEYWORDS } from "./signal-keywords.js";
import type { LoadedDocument } from "./documents.js";

export interface DetectPrompt {
  system: string;
  user: string;
}

export interface DetectDocumentReference {
  role: string;
  label: string;
  path: string;
}

export interface DetectResult {
  timestamp: string;
  project: string;
  projectRoot?: string;
  documents: string[];
  documentRefs?: DetectDocumentReference[];
  // source roots the agent should also scan for signals (code-aware detection)
  codeRoots?: string[];
  prompt: DetectPrompt;
}

// build the signal vocabulary section — each signal with representative keywords
function buildSignalVocabulary(): string {
  const lines: string[] = [];
  const signals = Object.entries(SIGNAL_KEYWORDS).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [signal, keywords] of signals) {
    lines.push(`- **${signal}**: ${keywords.slice(0, 4).join(", ")}`);
  }
  return lines.join("\n");
}

// build the documents section — each document with its full content or path references
function buildDocumentsSection(documents: LoadedDocument[], inline: boolean): string {
  if (inline) {
    const sections: string[] = [];
    for (const doc of documents) {
      sections.push(
        `### ${doc.label} (\`${doc.path}\`)\n\n${doc.content.trim()}`,
      );
    }
    return sections.join("\n\n---\n\n");
  }

  const lines = [
    "Read the following files fully before analysis:",
    "",
  ];
  for (const doc of documents) {
    lines.push(`- **${doc.label}** (${doc.role}): \`${doc.path}\``);
  }
  return lines.join("\n");
}

// docs-only system prompt (unchanged — kept byte-identical for back-compat)
const SYSTEM_PROMPT = `You are a documentation signal detector for doc-lint, a documentation linter that evaluates architecture documents against concern schemas.

Your task is to analyze project documentation and identify which architectural signals are present. Signals indicate areas of concern (e.g., "authentication", "payments", "rate-limiting") that determine which evaluation rules apply to the project.

You must ONLY return signals from the provided vocabulary. If you identify a concept that does not map to any signal in the vocabulary, include it in the unmappedConcepts field.

Respond with valid JSON matching the response schema exactly. No markdown fences, no commentary — just the JSON object.`;

// code-aware variant: the agent reads docs AND source, so capabilities present in
// the implementation but missing from (stale) docs still surface as signals.
const SYSTEM_PROMPT_WITH_CODE = `You are a signal detector for doc-lint, a linter that evaluates a project against concern schemas.

Your task is to analyze the project's documentation AND its source code, and identify which architectural signals are present. Signals indicate areas of concern (e.g., "authentication", "payments", "rate-limiting") that determine which evaluation rules apply to the project. Capabilities implemented in the code but not described in the docs are exactly what you must surface — do not limit yourself to what the documentation states.

You must ONLY return signals from the provided vocabulary. If you identify a concept that does not map to any signal in the vocabulary, include it in the unmappedConcepts field.

Respond with valid JSON matching the response schema exactly. No markdown fences, no commentary — just the JSON object.`;

function buildSourceCodeSection(codeRoots: string[]): string {
  const lines = [
    "## Source Code",
    "",
    "Also scan the implementation under these roots and surface signals present in the code even if the documentation omits them:",
    "",
  ];
  for (const root of codeRoots) {
    lines.push(`- \`${root}\``);
  }
  return lines.join("\n");
}

export function buildDetectPrompt(
  projectName: string,
  documents: LoadedDocument[],
  options: { inline?: boolean; projectRoot?: string; codeRoots?: string[] } = {},
): DetectResult {
  const inline = options.inline !== false;
  const hasCode = options.codeRoots != null && options.codeRoots.length > 0;
  const vocabulary = buildSignalVocabulary();
  const documentsSection = buildDocumentsSection(documents, inline);
  const signalCount = Object.keys(SIGNAL_KEYWORDS).length;

  const analyzeLine = hasCode
    ? "Analyze the project's documentation and source code, and identify which architectural signals are present."
    : "Analyze the following project documentation and identify which architectural signals are present.";
  const unmappedNote = hasCode
    ? "concepts you identified in the docs or code that don't map to any signal in the vocabulary — these help evolve the signal library"
    : "concepts you identified in the docs that don't map to any signal in the vocabulary — these help evolve the signal library";
  const sourceCodeSection = hasCode ? `\n\n${buildSourceCodeSection(options.codeRoots!)}` : "";

  const user = `# Signal Detection

${analyzeLine}

## Signal Vocabulary (${signalCount} signals)

${vocabulary}

## Response Schema

\`\`\`json
{
  "signals": [
    {
      "id": "<signal-id from vocabulary>",
      "confidence": "high | medium | low",
      "rationale": "<brief explanation of why this signal was detected>"
    }
  ],
  "unmappedConcepts": [
    {
      "concept": "<concept name>",
      "rationale": "<why this concept is relevant but not in the vocabulary>"
    }
  ]
}
\`\`\`

- **confidence**: "high" = explicit and central to the project, "medium" = mentioned or implied, "low" = tangentially related
- **unmappedConcepts**: ${unmappedNote}

## Project Documentation

${documentsSection}${sourceCodeSection}`;

  const result: DetectResult = {
    timestamp: new Date().toISOString(),
    project: projectName,
    documents: documents.map((d) => d.path),
    prompt: { system: hasCode ? SYSTEM_PROMPT_WITH_CODE : SYSTEM_PROMPT, user },
  };

  if (hasCode) {
    result.codeRoots = options.codeRoots;
  }

  if (!inline) {
    result.projectRoot = options.projectRoot ?? process.cwd();
    result.documentRefs = documents.map((d) => ({
      role: d.role,
      label: d.label,
      path: d.path,
    }));
  }

  return result;
}
