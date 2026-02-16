import type { FileMeta, LoopIssue, CommentBlockIssue, Severity } from '../types/report.js';
import { detectForLoops, stripCommentBlocks, type LoopScope } from '../core/liquidParser.js';

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
  nestedLoops: LoopScope[];
  hoistableFilterLines: number[];
  allForLoopLines: number[];
  allProductsLines: number[];
}): string {
  const parts: string[] = [];

  if (info.maxDepth >= 2 && info.nestedLoops.length > 0) {
    // Show what's being looped over
    const descriptions = info.nestedLoops.map(loop => {
      const typeLabel = loop.loopType === 'risky'
        ? ' (large collection)'
        : loop.loopType === 'critical'
        ? ' (all_products - deprecated)'
        : '';
      return `${loop.collection}${typeLabel}`;
    });

    const lines = info.nestedLoops.map(l => l.openLine);
    const loopDesc = descriptions.join(' > ');
    parts.push(`Nested loop over ${loopDesc} (${formatLines(lines)})`);
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

    // Nested loop (depth >= 2): context-aware scoring
    if (info.maxDepth >= 2) {
      const loopTypes = info.loops.map(l => l.loopType || 'risky');
      const hasCritical = loopTypes.some(t => t === 'critical');
      const allSafe = loopTypes.every(t => t === 'safe');
      const allRiskyOrCritical = loopTypes.every(t => t === 'risky' || t === 'critical');

      if (hasCritical) {
        score += 10;  // Critical: all_products nested
      } else if (allSafe) {
        score += 0;   // Safe: navigation loops - no penalty
      } else if (allRiskyOrCritical) {
        score += 5;   // Risky: all loops are risky collections
      } else {
        score += 3;   // Mixed: medium concern (some safe, some risky)
      }
    }

    // all_products usage: +5 — bypasses caching
    if (info.hasAllProducts) {
      score += 5;
    }

    // Hoistable filters (don't depend on iterator): +3 — actually fixable
    // Exclude translation filters (| t) and output-only filters that must render inline
    const nonHoistableFilters = ['t', 'translate'];
    const hoistableFilters = info.filters.filter((f) => {
      if (f.dependsOnIterator) return false;
      // Exclude translation and other output-only filters
      return !f.names.some(name => nonHoistableFilters.includes(name));
    });
    if (hoistableFilters.length > 0) {
      score += 3;
    }

    // Score 0 means simple idiomatic loop — no issue
    if (score === 0) {
      continue;
    }

    const nestedLoops = info.loops.filter((l) => l.depth >= 2);

    const hoistableFilterLines = [...new Set(hoistableFilters.map((f) => f.line))];

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
        nestedLoops,
        hoistableFilterLines,
        allForLoopLines,
        allProductsLines: info.allProductsLines,
      }),
      lineDetails: {
        forLoops: allForLoopLines,
        nestedLoops: nestedLoops.map(l => l.openLine),
        hoistableFilters: hoistableFilterLines,
        allProducts: info.allProductsLines,
      },
    });
  }

  return issues;
}

/**
 * Detect large comment blocks (>5 lines) in sections and templates.
 * These are likely dead code and should be audited for removal.
 */
export function detectCommentBlocks(files: FileMeta[]): CommentBlockIssue[] {
  const issues: CommentBlockIssue[] = [];

  for (const file of files) {
    const { largeComments } = stripCommentBlocks(file.content);
    for (const comment of largeComments) {
      issues.push({
        file: file.path,
        line: comment.line,
        lineCount: comment.lineCount,
        severity: 'MEDIUM',
      });
    }
  }

  return issues;
}
