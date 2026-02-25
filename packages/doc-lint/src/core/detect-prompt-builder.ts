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

const SYSTEM_PROMPT = `You are a documentation signal detector for doc-lint, a documentation linter that evaluates architecture documents against concern schemas.

Your task is to analyze project documentation and identify which architectural signals are present. Signals indicate areas of concern (e.g., "authentication", "payments", "rate-limiting") that determine which evaluation rules apply to the project.

You must ONLY return signals from the provided vocabulary. If you identify a concept that does not map to any signal in the vocabulary, include it in the unmappedConcepts field.

Respond with valid JSON matching the response schema exactly. No markdown fences, no commentary — just the JSON object.`;

export function buildDetectPrompt(
  projectName: string,
  documents: LoadedDocument[],
  options: { inline?: boolean; projectRoot?: string } = {},
): DetectResult {
  const inline = options.inline !== false;
  const vocabulary = buildSignalVocabulary();
  const documentsSection = buildDocumentsSection(documents, inline);
  const signalCount = Object.keys(SIGNAL_KEYWORDS).length;

  const user = `# Signal Detection

Analyze the following project documentation and identify which architectural signals are present.

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
- **unmappedConcepts**: concepts you identified in the docs that don't map to any signal in the vocabulary — these help evolve the signal library

## Project Documentation

${documentsSection}`;

  const result: DetectResult = {
    timestamp: new Date().toISOString(),
    project: projectName,
    documents: documents.map((d) => d.path),
    prompt: { system: SYSTEM_PROMPT, user },
  };

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
