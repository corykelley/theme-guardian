/**
 * Liquid parser wrapper + structured regex fallback detectors.
 *
 * MVP strategy: use robust regex/token scanning for the specific patterns
 * the analyzers need (for-loops, render/include calls). A liquidjs AST parse
 * is attempted but never blocks analysis if it fails.
 */

export interface LoopScope {
  /** 1-indexed line where the for-tag opens */
  openLine: number;
  /** 1-indexed line where the endfor closes (0 if unclosed) */
  closeLine: number;
  /** 1 = top-level, 2 = nested inside another, etc. */
  depth: number;
  /** Iterator variable name, e.g. "block", "link", "product" */
  iterator: string;
}

export interface FilterHit {
  /** 1-indexed line number */
  line: number;
  /** Filter names in the chain, e.g. ["image_url", "image_tag"] */
  names: string[];
  /** true when the input expression references an iterator on the loop stack */
  dependsOnIterator: boolean;
}

export interface ForLoopInfo {
  /** All loop scopes detected (with open/close lines, depth, iterator) */
  loops: LoopScope[];
  /** Filters found inside loop bodies */
  filters: FilterHit[];
  /** Maximum nesting depth found (1 = single loop, 2 = nested, etc.) */
  maxDepth: number;
  /** Whether all_products is referenced inside a loop body */
  hasAllProducts: boolean;
  /** 1-indexed line numbers where all_products is referenced inside loops */
  allProductsLines: number[];
}

export interface RenderCall {
  /** The snippet name referenced (without .liquid extension) */
  snippetName: string;
  /** 'render' or 'include' */
  type: 'render' | 'include';
}

/**
 * Extract filter names from a Liquid output tag's filter chain.
 * Given `block.settings.logo | image_url: 200 | image_tag`, returns ["image_url", "image_tag"].
 */
function extractFilterNames(filterChain: string): string[] {
  return filterChain
    .split('|')
    .slice(1) // skip the input expression
    .map((seg) => seg.trim().split(/[\s:]/)[0])
    .filter(Boolean);
}

/**
 * Check whether the full output expression (including filter arguments)
 * references any iterator currently on the stack.
 *
 * Strips string literals first to avoid false matches on things like
 * 'cart.remove' when the iterator is 'cart'.
 *
 * e.g. "block.settings.logo | image_url: 200" with iterator "block" → true
 *      "'cart.remove' | t | link_to: item.url" with iterator "item" → true
 *      "section.settings.title | upcase" with iterator "block" → false
 */
function dependsOnIterator(fullExpr: string, iteratorStack: string[]): boolean {
  // Strip string literals so 'cart.remove' doesn't false-match iterator "cart"
  const stripped = fullExpr.replace(/'[^']*'|"[^"]*"/g, '');
  // Extract all variable-like tokens (e.g. "item.url_to_remove", "section.settings.title")
  const tokens = stripped.match(/\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/g) || [];
  for (const token of tokens) {
    for (const iter of iteratorStack) {
      if (token === iter || token.startsWith(iter + '.')) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Detect for-loops and their characteristics via token scanning
 * with proper scope tracking using a loop stack.
 */
export function detectForLoops(content: string): ForLoopInfo {
  const lines = content.split('\n');

  const completedLoops: LoopScope[] = [];
  const loopStack: LoopScope[] = []; // open scopes, innermost last
  const filters: FilterHit[] = [];
  let hasAllProducts = false;
  const allProductsLines: number[] = [];
  let maxDepth = 0;

  const forOpenRe = /\{%-?\s*for\s+(\w+)\s+in\s+/g;
  const forCloseRe = /\{%-?\s*endfor\s*-?%\}/g;
  const outputRe = /\{\{(.*?)\}\}/g;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Process for-loop opens (may be multiple per line)
    let forMatch: RegExpExecArray | null;
    forOpenRe.lastIndex = 0;
    while ((forMatch = forOpenRe.exec(line)) !== null) {
      const depth = loopStack.length + 1;
      const scope: LoopScope = {
        openLine: lineNum,
        closeLine: 0,
        depth,
        iterator: forMatch[1],
      };
      loopStack.push(scope);
      if (depth > maxDepth) maxDepth = depth;
    }

    // Check for content inside loop bodies
    if (loopStack.length > 0) {
      // Check for all_products usage
      if (/all_products/.test(line)) {
        hasAllProducts = true;
        allProductsLines.push(lineNum);
      }

      // Check for filter usage inside output tags
      let outputMatch: RegExpExecArray | null;
      outputRe.lastIndex = 0;
      while ((outputMatch = outputRe.exec(line)) !== null) {
        const inner = outputMatch[1];
        if (!inner.includes('|')) continue;

        const parts = inner.split('|');
        const inputExpr = parts[0].trim();
        const filterNames = extractFilterNames(inner);
        if (filterNames.length === 0) continue;

        const iterators = loopStack.map((s) => s.iterator);
        filters.push({
          line: lineNum,
          names: filterNames,
          dependsOnIterator: dependsOnIterator(inputExpr, iterators),
        });
      }
    }

    // Process for-loop closes
    let closeMatch: RegExpExecArray | null;
    forCloseRe.lastIndex = 0;
    while ((closeMatch = forCloseRe.exec(line)) !== null) {
      const scope = loopStack.pop();
      if (scope) {
        scope.closeLine = lineNum;
        completedLoops.push(scope);
      }
    }
  }

  // Any unclosed loops still on the stack
  for (const scope of loopStack) {
    completedLoops.push(scope);
  }

  // Sort by openLine for consistent ordering
  completedLoops.sort((a, b) => a.openLine - b.openLine);

  return {
    loops: completedLoops,
    filters,
    maxDepth,
    hasAllProducts,
    allProductsLines,
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
