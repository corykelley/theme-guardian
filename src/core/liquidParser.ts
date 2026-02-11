/**
 * Liquid parser wrapper + structured regex fallback detectors.
 *
 * MVP strategy: use robust regex/token scanning for the specific patterns
 * the analyzers need (for-loops, render/include calls). A liquidjs AST parse
 * is attempted but never blocks analysis if it fails.
 */

export interface ForLoopInfo {
  /** Maximum nesting depth found (1 = single loop, 2 = nested, etc.) */
  maxDepth: number;
  /** Whether any filter (| filter) is used on an output tag inside a loop body */
  hasFilterInsideLoop: boolean;
  /** Whether all_products is referenced inside a loop body */
  hasAllProducts: boolean;
}

export interface RenderCall {
  /** The snippet name referenced (without .liquid extension) */
  snippetName: string;
  /** 'render' or 'include' */
  type: 'render' | 'include';
}

/**
 * Detect for-loops and their characteristics via token scanning.
 */
export function detectForLoops(content: string): ForLoopInfo {
  const lines = content.split('\n');

  let currentDepth = 0;
  let maxDepth = 0;
  let hasFilterInsideLoop = false;
  let hasAllProducts = false;
  let insideLoopDepth = 0; // tracks how many loop levels deep we are

  for (const line of lines) {
    const trimmed = line.trim();

    // Count for-loop opens on this line
    const forOpens = trimmed.match(/\{%-?\s*for\s+/g);
    if (forOpens) {
      for (const _ of forOpens) {
        currentDepth++;
        insideLoopDepth++;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
        }
      }
    }

    // Check for content inside loop bodies
    if (insideLoopDepth > 0) {
      // Check for filter usage inside output tags: {{ something | filter }}
      if (/\{\{[^}]*\|[^}]*\}\}/.test(trimmed)) {
        hasFilterInsideLoop = true;
      }

      // Check for all_products usage
      if (/all_products/.test(trimmed)) {
        hasAllProducts = true;
      }
    }

    // Count for-loop closes on this line
    const forCloses = trimmed.match(/\{%-?\s*endfor\s*-?%\}/g);
    if (forCloses) {
      for (const _ of forCloses) {
        currentDepth = Math.max(0, currentDepth - 1);
        insideLoopDepth = Math.max(0, insideLoopDepth - 1);
      }
    }
  }

  return {
    maxDepth,
    hasFilterInsideLoop,
    hasAllProducts,
  };
}

/**
 * Detect render/include calls and extract snippet names.
 */
export function detectRenderCalls(content: string): RenderCall[] {
  const calls: RenderCall[] = [];
  const regex = /\{%-?\s*(render|include)\s+['"]([^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    calls.push({
      type: match[1] as 'render' | 'include',
      snippetName: match[2],
    });
  }

  return calls;
}
