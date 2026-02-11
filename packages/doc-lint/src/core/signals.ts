import type { LoadedConcern } from "../types/index.js";
import { isConcernSchema, isInteractionSchema } from "../types/concerns.js";

export interface MatchResult {
  matched: LoadedConcern[];
  skipped: LoadedConcern[];
}

export function matchConcerns(
  declaredSignals: string[],
  allConcerns: LoadedConcern[],
  filterIds?: string[],
): MatchResult {
  const matched: LoadedConcern[] = [];
  const skipped: LoadedConcern[] = [];

  for (const concern of allConcerns) {
    // if filter is provided, only include concerns in the filter
    if (filterIds && !filterIds.includes(concern.id)) {
      skipped.push(concern);
      continue;
    }

    if (shouldLoadConcern(declaredSignals, concern)) {
      matched.push(concern);
    } else {
      skipped.push(concern);
    }
  }

  return { matched, skipped };
}

function shouldLoadConcern(declaredSignals: string[], concern: LoadedConcern): boolean {
  const schema = concern.schema;

  if (isConcernSchema(schema)) {
    // core concerns: load if ANY declared signal matches any_of
    return schema.triggers.any_of.some((trigger) => declaredSignals.includes(trigger));
  } else if (isInteractionSchema(schema)) {
    // interaction matrices: load if ALL signals in all_of are present
    const primaryMatch = schema.triggers.all_of.every((trigger) =>
      declaredSignals.includes(trigger),
    );
    if (primaryMatch) return true;

    // check alternative trigger sets
    if (schema.triggers.alternative_triggers) {
      return schema.triggers.alternative_triggers.some((alt) =>
        alt.all_of.every((trigger) => declaredSignals.includes(trigger)),
      );
    }

    return false;
  } else {
    const _exhaustive: never = schema;
    throw new Error(`Unknown schema type: ${JSON.stringify(_exhaustive)}`);
  }
}
