/**
 * Shadow Triggers Module
 *
 * Handles suggestion mode for MANUAL-ONLY skills that could benefit from
 * contextual suggestions without auto-loading.
 *
 * Shadow triggers match like regular triggers but don't auto-load the skill.
 * Instead, they output suggestions as additional context for Claude to consider.
 *
 * NOTE: Hooks are stateless output-only processes. They cannot track user
 * preferences or dismissals across prompts. User preference tracking would
 * require native Claude Code support or CLAUDE.md blocklists.
 */

import type { ShadowMatch, ShadowSuggestion } from './types.mjs';

/**
 * Convert shadow matches to user-facing suggestions
 *
 * Simply transforms match results into the suggestion format.
 * No filtering based on user preferences (not possible with hook architecture).
 */
export function convertMatchesToSuggestions(
  matches: ShadowMatch[]
): ShadowSuggestion[] {
  return matches.map((match) => ({
    skillName: match.skillName,
    description: match.rule.description,
    reason: match.reason,
    score: match.score,
  }));
}

/**
 * Format shadow suggestions for CLI output
 *
 * Returns formatted string to be included in additionalContext.
 * Output is informational - Claude decides whether to suggest skills to user.
 */
export function formatShadowSuggestions(
  suggestions: ShadowSuggestion[]
): string {
  if (suggestions.length === 0) {
    return '';
  }

  const lines: string[] = [];
  lines.push('');
  lines.push('## Related Skills (may be relevant):');
  lines.push('');

  for (const suggestion of suggestions) {
    lines.push(`- /${suggestion.skillName}: ${suggestion.description}`);
    lines.push(`  (${suggestion.reason})`);
  }

  lines.push('');
  lines.push('To load a skill, use: /skill-name');

  return lines.join('\n');
}
