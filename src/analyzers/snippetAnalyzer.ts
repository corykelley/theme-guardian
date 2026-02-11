import type { SnippetGraphIssue } from '../types/report.js';
import type { SnippetGraph } from '../core/graphBuilder.js';

interface AnalyzeOptions {
  maxSnippetDepth: number;
}

/**
 * Analyze snippet dependency graph for excessive depth and circular references.
 * Uses DFS from every node.
 */
export function analyzeSnippets(
  graph: SnippetGraph,
  options: AnalyzeOptions,
): SnippetGraphIssue[] {
  const issues: SnippetGraphIssue[] = [];
  const reportedCycles = new Set<string>();
  const reportedDepthChains = new Set<string>();

  // Sort nodes for deterministic output
  const nodes = [...graph.keys()].sort();

  for (const startNode of nodes) {
    dfs(startNode, [startNode], new Set([startNode]));
  }

  function dfs(node: string, path: string[], visited: Set<string>): void {
    const neighbors = graph.get(node);
    if (!neighbors) return;

    const sortedNeighbors = [...neighbors].sort();

    for (const neighbor of sortedNeighbors) {
      if (visited.has(neighbor)) {
        // Circular dependency detected
        const cycleStart = path.indexOf(neighbor);
        const cycle = [...path.slice(cycleStart), neighbor];
        const cycleKey = cycle.join(' → ');

        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          issues.push({
            type: 'CIRCULAR',
            chain: cycle,
            severity: 'HIGH',
          });
        }
        continue;
      }

      const newPath = [...path, neighbor];

      // Check depth (depth = number of edges = path length - 1 for new path)
      const depth = newPath.length - 1;
      if (depth > options.maxSnippetDepth) {
        const chainKey = newPath.join(' → ');
        if (!reportedDepthChains.has(chainKey)) {
          reportedDepthChains.add(chainKey);
          issues.push({
            type: 'DEPTH_EXCEEDED',
            chain: newPath,
            severity: 'MEDIUM',
          });
        }
      }

      visited.add(neighbor);
      dfs(neighbor, newPath, visited);
      visited.delete(neighbor);
    }
  }

  return issues;
}
