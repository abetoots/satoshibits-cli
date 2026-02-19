import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

import { isConcernSchema, isInteractionSchema } from "../types/concerns.js";
import { getConcernsDir } from "./paths.js";

import type { ConcernOrInteraction, LoadedConcern } from "../types/index.js";

export { getConcernsDir } from "./paths.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const CONCERN_SUBDIRS = [
  "core",
  "interactions",
  "promise-validation",
  "security",
  "operational",
  "compliance",
  "test-coverage",
];

export function loadAllConcerns(): LoadedConcern[] {
  const concerns: LoadedConcern[] = [];
  const concernsDir = getConcernsDir();

  for (const subdir of CONCERN_SUBDIRS) {
    const dir = path.join(concernsDir, subdir);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (file.endsWith(".yaml") || file.endsWith(".yml")) {
        const filePath = path.join(dir, file);
        const loaded = loadConcernFile(filePath);
        if (loaded) concerns.push(loaded);
      }
    }
  }

  return concerns;
}

function loadConcernFile(filePath: string): LoadedConcern | null {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = yaml.load(raw);

  const validated = validateConcernSchema(parsed, filePath);
  if (!validated) return null;

  if (isConcernSchema(validated)) {
    const c = validated.concern;
    return {
      schema: validated,
      filePath,
      id: c.id,
      version: c.version,
      name: c.name,
      type: "concern",
      category: c.category,
      severity: c.severity,
      triggerSignals: validated.triggers.any_of,
      tier: validated.metadata?.tier,
    };
  }

  if (isInteractionSchema(validated)) {
    const i = validated.interaction;
    const altSignals: string[] = [];
    if (validated.triggers.alternative_triggers) {
      for (const alt of validated.triggers.alternative_triggers) {
        altSignals.push(...alt.all_of);
      }
    }
    // deduplicate primary + alternative trigger signals
    const uniqueSignals = [...new Set([...validated.triggers.all_of, ...altSignals])];

    return {
      schema: validated,
      filePath,
      id: i.id,
      version: i.version,
      name: i.name,
      type: "interaction",
      category: i.category,
      severity: i.severity,
      triggerSignals: uniqueSignals,
      tier: validated.metadata?.tier,
    };
  }

  // exhaustive: if neither type guard matched, validation should have caught it
  return null;
}

function validateConcernSchema(data: unknown, filePath: string): ConcernOrInteraction | null {
  if (typeof data !== "object" || data === null) return null;

  // one intermediate record for top-level property access
  const obj: Record<string, unknown> = data as Record<string, unknown>;

  // must have either 'concern' or 'interaction' top-level key
  if (!isRecord(obj.concern) && !isRecord(obj.interaction)) return null;

  if (isRecord(obj.concern)) {
    const c = obj.concern;
    if (typeof c.id !== "string" || !c.id) {
      throw new Error(`Invalid concern at ${filePath}: missing 'concern.id'`);
    }
    if (typeof c.version !== "string") {
      throw new Error(`Invalid concern at ${filePath}: missing 'concern.version'`);
    }
    if (typeof c.name !== "string") {
      throw new Error(`Invalid concern at ${filePath}: missing 'concern.name'`);
    }
    if (typeof c.severity !== "string") {
      throw new Error(`Invalid concern at ${filePath}: missing 'concern.severity'`);
    }

    // validate triggers
    if (!isRecord(obj.triggers)) {
      throw new Error(`Invalid concern at ${filePath}: missing 'triggers'`);
    }
    if (!Array.isArray(obj.triggers.any_of) || obj.triggers.any_of.length === 0) {
      throw new Error(`Invalid concern at ${filePath}: 'triggers.any_of' must be a non-empty array`);
    }
  }

  if (isRecord(obj.interaction)) {
    const i = obj.interaction;
    if (typeof i.id !== "string" || !i.id) {
      throw new Error(`Invalid interaction at ${filePath}: missing 'interaction.id'`);
    }
    if (typeof i.version !== "string") {
      throw new Error(`Invalid interaction at ${filePath}: missing 'interaction.version'`);
    }
    if (typeof i.name !== "string") {
      throw new Error(`Invalid interaction at ${filePath}: missing 'interaction.name'`);
    }
    if (typeof i.severity !== "string") {
      throw new Error(`Invalid interaction at ${filePath}: missing 'interaction.severity'`);
    }

    // validate triggers
    if (!isRecord(obj.triggers)) {
      throw new Error(`Invalid interaction at ${filePath}: missing 'triggers'`);
    }
    if (!Array.isArray(obj.triggers.all_of) || obj.triggers.all_of.length === 0) {
      throw new Error(`Invalid interaction at ${filePath}: 'triggers.all_of' must be a non-empty array`);
    }
  }

  // fields validated above; final cast needed because TS can't track field-by-field validation
  return data as ConcernOrInteraction;
}
