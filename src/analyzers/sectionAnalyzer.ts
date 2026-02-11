import type { FileMeta, SectionIssue, Severity } from '../types/report.js';

interface AnalyzeOptions {
  maxSectionLines: number;
  maxSectionBlocks: number;
}

/**
 * Analyze section files for excessive size and block counts.
 */
export function analyzeSections(
  sections: FileMeta[],
  options: AnalyzeOptions,
): SectionIssue[] {
  const issues: SectionIssue[] = [];

  for (const section of sections) {
    const { lines } = section;

    // Count occurrences of "type": in the content (JSON schema blocks)
    const typeMatches = section.content.match(/"type"\s*:/g);
    const blocks = typeMatches ? typeMatches.length : 0;

    let lineSeverity: Severity | null = null;
    let blockSeverity: Severity | null = null;

    // Line thresholds
    if (lines > 600) {
      lineSeverity = 'HIGH';
    } else if (lines > options.maxSectionLines) {
      lineSeverity = 'MEDIUM';
    }

    // Block thresholds
    if (blocks > 20) {
      blockSeverity = 'HIGH';
    } else if (blocks > options.maxSectionBlocks) {
      blockSeverity = 'MEDIUM';
    }

    // Take highest severity if both apply
    const severity = highestSeverity(lineSeverity, blockSeverity);

    if (severity === null) {
      continue; // no issues
    }

    const messageParts: string[] = [];
    if (lineSeverity) {
      messageParts.push(`Section has ${lines} lines (threshold: ${lines > 600 ? 600 : options.maxSectionLines})`);
    }
    if (blockSeverity) {
      messageParts.push(`Section has ${blocks} blocks (threshold: ${blocks > 20 ? 20 : options.maxSectionBlocks})`);
    }

    issues.push({
      file: section.path,
      lines,
      blocks,
      severity,
      message: messageParts.join('; '),
    });
  }

  return issues;
}

function highestSeverity(a: Severity | null, b: Severity | null): Severity | null {
  const rank: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;

  return rank[a] >= rank[b] ? a : b;
}
