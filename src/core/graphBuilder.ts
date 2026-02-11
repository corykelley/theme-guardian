import { posix } from 'node:path';
import type { FileMeta } from '../types/report.js';
import { detectRenderCalls } from './liquidParser.js';

export type SnippetGraph = Map<string, Set<string>>;

/**
 * Extract the logical snippet name from a file path.
 * e.g. "snippets/icon-cart.liquid" -> "icon-cart"
 */
function snippetNameFromPath(filePath: string): string {
  const base = posix.basename(filePath, '.liquid');
  return base;
}

/**
 * Build a directed graph of snippet dependencies.
 * Nodes: snippet logical names.
 * Edges: snippetA references snippetB via render/include.
 */
export function buildSnippetGraph(snippets: FileMeta[]): SnippetGraph {
  const graph: SnippetGraph = new Map();

  // Collect all known snippet names
  const knownNames = new Set<string>();
  for (const snippet of snippets) {
    knownNames.add(snippetNameFromPath(snippet.path));
  }

  // Build adjacency list
  for (const snippet of snippets) {
    const name = snippetNameFromPath(snippet.path);
    if (!graph.has(name)) {
      graph.set(name, new Set());
    }

    const calls = detectRenderCalls(snippet.content);
    for (const call of calls) {
      // Only add edges to known snippets (ignore external references).
      // Exclude self-references: snippets commonly render themselves with
      // different parameters (e.g. {% render 'icons' with icon %}), which
      // is a standard Liquid pattern, not an actual circular dependency.
      if (knownNames.has(call.snippetName) && call.snippetName !== name) {
        graph.get(name)!.add(call.snippetName);
      }
    }
  }

  return graph;
}
