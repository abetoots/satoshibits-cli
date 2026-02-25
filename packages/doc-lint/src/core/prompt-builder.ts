import * as fs from "node:fs";
import * as path from "node:path";

import { isConcernSchema, isInteractionSchema } from "../types/concerns.js";
import { getConcernsDir } from "./paths.js";

import type { LoadedDocument } from "./documents.js";
import type { AssembledPrompt, DocumentReference, LoadedConcern } from "../types/index.js";

const TEMPLATE_VERSION = "1.0";

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
): AssembledPrompt {
  const template = loadTemplate("evaluation.md");
  const concernYaml = fs.readFileSync(concern.filePath, "utf8");
  const documentsBlock = formatDocumentsBlock(docs, inline);

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

function buildSystemMessage(concern: LoadedConcern): string {
  const schema = concern.schema;

  if (isConcernSchema(schema)) {
    return (
      `You are a documentation validator evaluating the concern: "${schema.concern.name}" ` +
      `(${schema.concern.id} v${schema.concern.version}). ` +
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
