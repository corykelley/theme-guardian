import type { FileMeta, LoopIssue, Severity } from '../types/report.js';
import { detectForLoops } from '../core/liquidParser.js';

function computeSeverity(score: number): Severity {
  if (score >= 5) return 'HIGH';
  if (score >= 3) return 'MEDIUM';
  return 'LOW';
}

function formatLines(nums: number[]): string {
  if (nums.length === 1) return `line ${nums[0]}`;
  return `lines ${nums.join(', ')}`;
}

function buildMessage(info: {
  maxDepth: number;
  hasAllProducts: boolean;
  nestedLoopLines: number[];
  hoistableFilterLines: number[];
  allForLoopLines: number[];
  allProductsLines: number[];
}): string {
  const parts: string[] = [];

  if (info.maxDepth >= 2) {
    parts.push(`Nested loop detected (${formatLines(info.nestedLoopLines)})`);
  }

  if (info.hoistableFilterLines.length > 0) {
    parts.push(`hoistable filters (${formatLines(info.hoistableFilterLines)})`);
  }

  if (info.hasAllProducts) {
    parts.push(`all_products usage (${formatLines(info.allProductsLines)})`);
  }

  return parts.join(' with ');
}

/**
 * Analyze sections and templates for loop performance issues.
 * Only flags genuine performance concerns: nesting, all_products, hoistable filters.
 */
export function analyzeLoops(files: FileMeta[]): LoopIssue[] {
  const issues: LoopIssue[] = [];

  for (const file of files) {
    const info = detectForLoops(file.content);

    if (info.maxDepth === 0) {
      continue; // no loops, no issue
    }

    let score = 0;

    // Nested loop (depth >= 2): +5 — O(n²) concern
    if (info.maxDepth >= 2) {
      score += 5;
    }

    // all_products usage: +5 — bypasses caching
    if (info.hasAllProducts) {
      score += 5;
    }

    // Hoistable filters (don't depend on iterator): +3 — actually fixable
    const hoistableFilters = info.filters.filter((f) => !f.dependsOnIterator);
    if (hoistableFilters.length > 0) {
      score += 3;
    }

    // Score 0 means simple idiomatic loop — no issue
    if (score === 0) {
      continue;
    }

    const nestedLoopLines = info.loops
      .filter((l) => l.depth >= 2)
      .map((l) => l.openLine);

    const hoistableFilterLines = hoistableFilters.map((f) => f.line);

    const allForLoopLines = info.loops.map((l) => l.openLine);

    const severity = computeSeverity(score);

    issues.push({
      file: file.path,
      depth: info.maxDepth,
      score,
      severity,
      message: buildMessage({
        maxDepth: info.maxDepth,
        hasAllProducts: info.hasAllProducts,
        nestedLoopLines,
        hoistableFilterLines,
        allForLoopLines,
        allProductsLines: info.allProductsLines,
      }),
      lineDetails: {
        forLoops: allForLoopLines,
        nestedLoops: nestedLoopLines,
        hoistableFilters: hoistableFilterLines,
        allProducts: info.allProductsLines,
      },
    });
  }

  return issues;
}
