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

    const blocks = countSchemaBlocks(section.content);

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
      messageParts.push(`Section has ${blocks} ${blocks === 1 ? 'block' : 'blocks'} (threshold: ${blocks > 20 ? 20 : options.maxSectionBlocks})`);
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

/**
 * Extract the {% schema %}…{% endschema %} JSON and count
 * top-level block type definitions in the "blocks" array.
 */
function countSchemaBlocks(content: string): number {
  const schemaMatch = content.match(
    /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/,
  );
  if (!schemaMatch) return 0;

  try {
    const schema = JSON.parse(schemaMatch[1]);
    return Array.isArray(schema.blocks) ? schema.blocks.length : 0;
  } catch {
    return 0;
  }
}

function highestSeverity(a: Severity | null, b: Severity | null): Severity | null {
  const rank: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;

  return rank[a] >= rank[b] ? a : b;
}
