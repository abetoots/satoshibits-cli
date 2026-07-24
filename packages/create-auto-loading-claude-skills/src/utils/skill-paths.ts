import fs from "fs";
import path from "path";

/**
 * The canonical filename casings a skill's definition may use.
 *
 * Skills are discovered with a case-insensitive glob, so any code that later checks a
 * skill's existence or reads its content must accept the same casings — otherwise, on a
 * case-sensitive filesystem, a lowercase `skill.md` skill syncs and validates cleanly but
 * is treated as missing everywhere else ("scored but silently never surfaces").
 */
const SKILL_FILENAMES = ["SKILL.md", "skill.md"] as const;

/**
 * Resolve a skill's definition file, or null if none exists.
 *
 * This is the SINGLE resolution primitive — `skillExists`, sync's drop predicate,
 * validate's orphan check, and the add-skill existence guard all funnel through it, so the
 * "which files count as this skill" invariant cannot drift between call sites.
 */
export function resolveSkillFile(
  skillsDir: string,
  name: string,
): string | null {
  for (const file of SKILL_FILENAMES) {
    const candidate = path.join(skillsDir, name, file);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Does a skill's definition file exist on disk (either casing)?
 */
export function skillExists(skillsDir: string, name: string): boolean {
  return resolveSkillFile(skillsDir, name) !== null;
}
