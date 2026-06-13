import * as fs from "node:fs";
import * as path from "node:path";

import { isConcernSchema, isInteractionSchema } from "../types/concerns.js";
import { getConcernsDir } from "./paths.js";

import type { LoadedDocument } from "./documents.js";
import type { AssembledPrompt, CodeMap, DocumentReference, LoadedConcern } from "../types/index.js";

const TEMPLATE_VERSION = "1.0";

const TIER_CONTEXT: Record<number, { label: string; guidance: string }> = {
  1: {
    label: "Tier 1 — Foundational",
    guidance:
      "This is a foundational concern. Evaluate it in isolation — do not assume any higher-tier concerns (behavioral or structural) are established.",
  },
  2: {
    label: "Tier 2 — Behavioral",
    guidance:
      "This is a behavioral concern. You may assume tier 1 (foundational) concerns are established. Do not assume structural (tier 3) concerns are in place.",
  },
  3: {
    label: "Tier 3 — Structural",
    guidance:
      "This is a structural concern. You may assume tier 1 (foundational) and tier 2 (behavioral) concerns are established. Evaluate structural coherence across the documentation.",
  },
};

function buildTierContext(tier: number | undefined): string {
  if (tier == null) return "";
  const ctx = TIER_CONTEXT[tier];
  if (!ctx) return "";
  return `[${ctx.label}] ${ctx.guidance} `;
}

function loadTemplate(name: string): string {
  const templatePath = path.join(getConcernsDir(), "templates", name);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, "utf8");
}

function formatDocumentsBlock(docs: LoadedDocument[], inline: boolean): string {
  if (inline) {
    return docs
      .map(
        (doc) =>
          `### ${doc.label} (${doc.role})\n\n\`\`\`\n${doc.content}\n\`\`\``,
      )
      .join("\n\n");
  }

  const lines = [
    "## Documents",
    "",
    "Read the following files fully before evaluation:",
    "",
  ];
  for (const doc of docs) {
    lines.push(`- **${doc.label}** (${doc.role}): \`${doc.path}\``);
  }
  return lines.join("\n");
}

function buildDocumentReferences(docs: LoadedDocument[]): DocumentReference[] {
  return docs.map((doc) => ({
    role: doc.role,
    label: doc.label,
    path: doc.path,
  }));
}

// render the code map as compact, citable text for drift/reconcile prompts.
// includes a coverage section so the model can distinguish "not scanned" from
// "not present in code".
export function formatCodeMapBlock(codeMap: CodeMap): string {
  const sections: string[] = [];

  const deps = [...new Set(codeMap.packages.flatMap((p) => p.dependencies))];
  if (deps.length > 0) sections.push(`#### Dependencies\n${deps.join(", ")}`);

  if (codeMap.routes.length > 0) {
    sections.push(
      `#### Routes\n${codeMap.routes
        .map((r) => `- ${r.method} ${r.path} (${r.file}:${r.line})`)
        .join("\n")}`,
    );
  }
  if (codeMap.models.length > 0) {
    sections.push(
      `#### Data models\n${codeMap.models
        .map((m) => `- ${m.name} [${m.orm}] (${m.file}:${m.line})`)
        .join("\n")}`,
    );
  }
  if (codeMap.externalCalls.length > 0) {
    const calls = [...new Set(codeMap.externalCalls.map((c) => `- ${c.target} [${c.kind}] (${c.file}:${c.line})`))];
    sections.push(`#### External calls\n${calls.join("\n")}`);
  }
  if (codeMap.apiSurface.length > 0) {
    sections.push(
      `#### Exported surface\n${codeMap.apiSurface
        .slice(0, 200)
        .map((a) => `- ${a.kind} ${a.name} (${a.file}:${a.line})`)
        .join("\n")}`,
    );
  }
  if (codeMap.envVars.length > 0) sections.push(`#### Env vars\n${codeMap.envVars.join(", ")}`);
  if (codeMap.configSignals.length > 0) sections.push(`#### Config/infra\n${codeMap.configSignals.join(", ")}`);

  const cov = codeMap.coverage;
  sections.push(
    `#### Coverage (READ THIS)\n` +
      `- Files: ${codeMap.fileCount} total, ${codeMap.sampledFiles} scanned\n` +
      (cov.unsupportedLanguages.length > 0
        ? `- Unsupported (not analyzed): ${cov.unsupportedLanguages.join(", ")}\n`
        : "") +
      (cov.sampledOutPaths.length > 0
        ? `- Dropped by token budget (NOT scanned): ${cov.sampledOutPaths.length} files — treat related claims as unverifiable\n`
        : "") +
      `- Anything not listed above was either not present OR not scanned; do not assume absence.`,
  );

  sections.push(`#### Directory tree\n\`\`\`\n${codeMap.tree}\n\`\`\``);

  return sections.join("\n\n");
}

function getResponseSchema(concern: LoadedConcern): object {
  const schema = concern.schema;

  if (isConcernSchema(schema)) {
    return {
      type: "evaluation",
      schema_id: concern.id,
      fields: schema.evaluation.evidence_required.map((f) => ({
        field: f.field,
        type: f.type,
        required: f.required ?? false,
      })),
    };
  } else if (isInteractionSchema(schema)) {
    return {
      type: "interaction",
      schema_id: concern.id,
      failure_modes: schema.failure_modes.map((fm) => ({
        id: fm.id,
        fields: fm.evidence_required.map((f) => ({
          field: f.field,
          type: f.type,
        })),
      })),
    };
  } else {
    const _exhaustive: never = schema;
    throw new Error(`Unknown schema type: ${JSON.stringify(_exhaustive)}`);
  }
}

export function buildEvaluationPrompt(
  concern: LoadedConcern,
  docs: LoadedDocument[],
  inline = true,
  codeMap?: CodeMap,
): AssembledPrompt {
  const template = loadTemplate("evaluation.md");
  const concernYaml = fs.readFileSync(concern.filePath, "utf8");
  let documentsBlock = formatDocumentsBlock(docs, inline);

  // in reconcile mode, append code facts so code-aware concerns can reason about
  // the actual implementation alongside the docs.
  if (codeMap) {
    documentsBlock += `\n\n### Code Map (extracted from source)\n\n${formatCodeMapBlock(codeMap)}`;
  }

  const userPrompt = template
    .replace("{{CONCERN_YAML}}", concernYaml)
    .replace("{{DOCUMENTS}}", documentsBlock);

  const system = buildSystemMessage(concern);

  const prompt: AssembledPrompt = {
    concernId: concern.id,
    concernVersion: concern.version,
    concernName: concern.name,
    type: concern.type === "interaction" ? "interaction" : "concern",
    system,
    user: userPrompt,
    responseSchema: getResponseSchema(concern),
    metadata: {
      documentsIncluded: docs.map((d) => d.path),
      templateVersion: TEMPLATE_VERSION,
    },
  };

  if (!inline) {
    prompt.documents = buildDocumentReferences(docs);
  }

  return prompt;
}

export function buildContradictionPrompt(docs: LoadedDocument[], inline = true): AssembledPrompt {
  const template = loadTemplate("contradiction.md");
  const documentsBlock = formatDocumentsBlock(docs, inline);

  const userPrompt = template.replace("{{DOCUMENTS}}", documentsBlock);

  const system =
    "You are a documentation validator specializing in cross-document contradiction detection. " +
    "You compare statements across multiple documents to find conflicts. " +
    "Be precise: only flag genuine contradictions, not complementary information.";

  const prompt: AssembledPrompt = {
    concernId: "contradiction-scanner",
    concernVersion: "1.0",
    concernName: "Cross-Document Contradiction Scanner",
    type: "contradiction",
    system,
    user: userPrompt,
    responseSchema: {
      type: "contradiction",
      fields: [
        { field: "id", type: "string" },
        { field: "statement_a", type: "object" },
        { field: "statement_b", type: "object" },
        { field: "conflict_type", type: "string" },
        { field: "severity", type: "string" },
        { field: "explanation", type: "string" },
      ],
    },
    metadata: {
      documentsIncluded: docs.map((d) => d.path),
      templateVersion: TEMPLATE_VERSION,
    },
  };

  if (!inline) {
    prompt.documents = buildDocumentReferences(docs);
  }

  return prompt;
}

export function buildDriftPrompt(docs: LoadedDocument[], codeMap: CodeMap): AssembledPrompt {
  const template = loadTemplate("drift.md");
  const documentsBlock = formatDocumentsBlock(docs, true);
  const codeMapBlock = formatCodeMapBlock(codeMap);

  const userPrompt = template
    .replace("{{DOCUMENTS}}", documentsBlock)
    .replace("{{CODE_MAP}}", codeMapBlock);

  const system =
    "You are a documentation-vs-code reconciliation validator. You compare authored " +
    "documentation against a sampled, best-effort map of the actual codebase to find drift. " +
    "Absence from the code map means 'not scanned', never 'not implemented'. " +
    "Prefer fewer, high-confidence findings; mark anything unverifiable for human review.";

  return {
    concernId: "drift-scanner",
    concernVersion: "1.0",
    concernName: "Documentation–Code Drift Scanner",
    type: "drift",
    system,
    user: userPrompt,
    responseSchema: {
      type: "drift",
      fields: [
        { field: "id", type: "string" },
        { field: "drift_type", type: "string" },
        { field: "doc_claim", type: "object" },
        { field: "code_reality", type: "object" },
        { field: "severity", type: "string" },
        { field: "confidence", type: "string" },
        { field: "explanation", type: "string" },
        { field: "recommendation", type: "string" },
        { field: "requires_human_review", type: "boolean" },
      ],
    },
    metadata: {
      documentsIncluded: docs.map((d) => d.path),
      templateVersion: TEMPLATE_VERSION,
    },
  };
}

function buildSystemMessage(concern: LoadedConcern): string {
  const schema = concern.schema;

  if (isConcernSchema(schema)) {
    const tierContext = buildTierContext(concern.tier);
    return (
      `You are a documentation validator evaluating the concern: "${schema.concern.name}" ` +
      `(${schema.concern.id} v${schema.concern.version}). ` +
      `${tierContext}` +
      `Severity level: ${schema.concern.severity}. ` +
      `${schema.concern.description.trim()} ` +
      "Produce structured JSON output following the evidence_required fields in the schema."
    );
  } else if (isInteractionSchema(schema)) {
    return (
      `You are a documentation validator evaluating the interaction: "${schema.interaction.name}" ` +
      `(${schema.interaction.id} v${schema.interaction.version}). ` +
      `Severity level: ${schema.interaction.severity}. ` +
      `${schema.interaction.description.trim()} ` +
      "Evaluate each failure mode and produce structured JSON output."
    );
  } else {
    const _exhaustive: never = schema;
    throw new Error(`Unknown schema type: ${JSON.stringify(_exhaustive)}`);
  }
}
