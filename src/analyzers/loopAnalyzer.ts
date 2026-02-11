import type { FileMeta, LoopIssue, Severity } from '../types/report.js';
import { detectForLoops } from '../core/liquidParser.js';

function computeSeverity(score: number): Severity {
  if (score >= 6) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

function buildMessage(info: {
  maxDepth: number;
  hasFilterInsideLoop: boolean;
  hasAllProducts: boolean;
}): string {
  const parts: string[] = [];

  if (info.maxDepth >= 2) {
    parts.push('Nested loop detected');
  } else {
    parts.push('Loop detected');
  }

  if (info.hasFilterInsideLoop) {
    parts.push('with filter usage');
  }

  if (info.hasAllProducts) {
    parts.push('using all_products');
  }

  return parts.join(' ');
}

/**
 * Analyze sections and templates for loop performance issues.
 */
export function analyzeLoops(files: FileMeta[]): LoopIssue[] {
  const issues: LoopIssue[] = [];

  for (const file of files) {
    const info = detectForLoops(file.content);

    if (info.maxDepth === 0) {
      continue; // no loops, no issue
    }

    let score = 0;

    // Loop exists: +1
    score += 1;

    // Nested loop (depth >= 2): +3
    if (info.maxDepth >= 2) {
      score += 3;
    }

    // Filter inside loop: +2
    if (info.hasFilterInsideLoop) {
      score += 2;
    }

    // all_products usage: +5
    if (info.hasAllProducts) {
      score += 5;
    }

    const severity = computeSeverity(score);

    issues.push({
      file: file.path,
      depth: info.maxDepth,
      score,
      severity,
      message: buildMessage(info),
    });
  }

  return issues;
}
