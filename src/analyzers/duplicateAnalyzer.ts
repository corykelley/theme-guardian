import { createHash } from 'node:crypto';
import type { FileMeta, DuplicateSnippetIssue } from '../types/report.js';

/**
 * Normalize snippet content for comparison:
 * - Remove Liquid comments ({% comment %}...{% endcomment %})
 * - Trim whitespace
 * - Collapse multiple whitespace to single space
 */
function normalizeContent(content: string): string {
  let normalized = content;

  // Remove {% comment %}...{% endcomment %} blocks
  normalized = normalized.replace(
    /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g,
    '',
  );

  // Trim and collapse whitespace
  normalized = normalized.trim().replace(/\s+/g, ' ');

  return normalized;
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Detect duplicate snippets by comparing normalized content hashes.
 */
export function analyzeDuplicates(snippets: FileMeta[]): DuplicateSnippetIssue[] {
  const hashMap = new Map<string, string[]>();

  for (const snippet of snippets) {
    const normalized = normalizeContent(snippet.content);
    const hash = hashContent(normalized);

    if (!hashMap.has(hash)) {
      hashMap.set(hash, []);
    }
    hashMap.get(hash)!.push(snippet.path);
  }

  const issues: DuplicateSnippetIssue[] = [];

  for (const [hash, paths] of hashMap) {
    if (paths.length > 1) {
      issues.push({
        hash,
        snippets: paths.sort(),
        severity: 'LOW',
      });
    }
  }

  return issues;
}
