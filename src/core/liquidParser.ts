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
  /** Collection expression being looped over, e.g. "collection.products", "section.blocks" */
  collection: string;
  /** Classification of loop type: safe (navigation), risky (collections), or critical (all_products) */
  loopType?: 'safe' | 'risky' | 'critical';
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

export interface CommentBlock {
  /** 1-indexed line where the comment block starts */
  line: number;
  /** Number of lines the comment block spans */
  lineCount: number;
}

export interface StripResult {
  /** Content with comment blocks removed (replaced with blank lines to preserve line numbers) */
  cleaned: string;
  /** Large comment blocks found (>5 lines) */
  largeComments: CommentBlock[];
}

/**
 * Strip {% comment %}...{% endcomment %} blocks from Liquid content.
 * Replaces comment blocks with blank lines to preserve line numbering.
 * Returns both the cleaned content and metadata about large comment blocks (>5 lines).
 */
export function stripCommentBlocks(content: string): StripResult {
  const largeComments: CommentBlock[] = [];
  const commentRe = /\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g;

  let match: RegExpExecArray | null;
  const replacements: { start: number; end: number; lineCount: number; startLine: number }[] = [];

  while ((match = commentRe.exec(content)) !== null) {
    const before = content.slice(0, match.index);
    const startLine = before.split('\n').length;
    const matchLines = match[0].split('\n').length;

    replacements.push({
      start: match.index,
      end: match.index + match[0].length,
      lineCount: matchLines,
      startLine,
    });

    if (matchLines > 5) {
      largeComments.push({ line: startLine, lineCount: matchLines });
    }
  }

  // Replace comment blocks with equivalent blank lines to preserve line numbering
  let cleaned = content;
  let offset = 0;
  for (const rep of replacements) {
    const blank = '\n'.repeat(rep.lineCount - 1);
    cleaned = cleaned.slice(0, rep.start + offset) + blank + cleaned.slice(rep.end + offset);
    offset += blank.length - (rep.end - rep.start);
  }

  return { cleaned, largeComments };
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
 * references any iterator currently on the stack, or any tainted variable
 * (one whose value depends on an iterator, directly or transitively).
 *
 * Strips string literals first to avoid false matches on things like
 * 'cart.remove' when the iterator is 'cart'.
 *
 * e.g. "block.settings.logo | image_url: 200" with iterator "block" → true
 *      "'cart.remove' | t | link_to: item.url" with iterator "item" → true
 *      "section.settings.title | upcase" with iterator "block" → false
 *      "key | img_url" with taintedVars containing "key" → true
 */
function dependsOnIterator(
  fullExpr: string,
  iteratorStack: string[],
  taintedVars: Set<string> = new Set(),
): boolean {
  // Strip string literals so 'cart.remove' doesn't false-match iterator "cart"
  const stripped = fullExpr.replace(/'[^']*'|"[^"]*"/g, '');
  // Extract all variable-like tokens (e.g. "item.url_to_remove", "section.settings.title")
  const tokens = stripped.match(/\b[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*/g) || [];
  for (const token of tokens) {
    const root = token.split('.')[0];
    // Check tainted variables (assigns that depend on iterators)
    if (taintedVars.has(root)) {
      return true;
    }
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
  // Strip comment blocks before analysis so commented-out code is never scanned
  const { cleaned } = stripCommentBlocks(content);
  const lines = cleaned.split('\n');

  const completedLoops: LoopScope[] = [];
  const loopStack: LoopScope[] = []; // open scopes, innermost last
  const filters: FilterHit[] = [];
  let hasAllProducts = false;
  const allProductsLines: number[] = [];
  let maxDepth = 0;

  const forOpenRe = /\{%-?\s*for\s+(\w+)\s+in\s+([\w.\[\]'":()\s-]+?)(?:\s+-?%\}|\s+limit:|\s+offset:)/g;
  const forCloseRe = /\{%-?\s*endfor\s*-?%\}/g;
  const outputRe = /\{\{(.*?)\}\}/g;
  const assignRe = /\{%-?\s*assign\s+(\w+)\s*=(.*?)(?:-?%\})/g;

  // Track variables tainted by iterator dependency (per loop depth).
  // Each entry in the stack corresponds to a loop scope and its tainted vars.
  const taintedVarsStack: Set<string>[] = [];

  /** Get the merged set of all tainted vars across all active loop scopes */
  function allTaintedVars(): Set<string> {
    const merged = new Set<string>();
    for (const s of taintedVarsStack) {
      for (const v of s) merged.add(v);
    }
    return merged;
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];

    // Process for-loop opens (may be multiple per line)
    let forMatch: RegExpExecArray | null;
    forOpenRe.lastIndex = 0;
    while ((forMatch = forOpenRe.exec(line)) !== null) {
      const depth = loopStack.length + 1;
      const iterator = forMatch[1];
      const collection = forMatch[2].trim();
      const scope: LoopScope = {
        openLine: lineNum,
        closeLine: 0,
        depth,
        iterator,
        collection,
      };
      loopStack.push(scope);
      taintedVarsStack.push(new Set<string>());
      if (depth > maxDepth) maxDepth = depth;
    }

    // Check for content inside loop bodies
    if (loopStack.length > 0) {
      // Build iterator list including 'forloop' (Liquid's built-in loop variable)
      const iterators = [...loopStack.map((s) => s.iterator), 'forloop'];
      const tainted = allTaintedVars();

      // Check for all_products usage
      if (/all_products/.test(line)) {
        hasAllProducts = true;
        allProductsLines.push(lineNum);
      }

      // Track {% assign %} tags to detect tainted variables
      let assignMatch: RegExpExecArray | null;
      assignRe.lastIndex = 0;
      while ((assignMatch = assignRe.exec(line)) !== null) {
        const varName = assignMatch[1];
        const rhsExpr = assignMatch[2];
        if (dependsOnIterator(rhsExpr, iterators, tainted)) {
          // This variable is tainted — add to the current (innermost) loop's set
          taintedVarsStack[taintedVarsStack.length - 1].add(varName);
          // Also update merged set for subsequent checks on this line
          tainted.add(varName);
        }
      }

      // Check for filter usage inside output tags
      let outputMatch: RegExpExecArray | null;
      outputRe.lastIndex = 0;
      while ((outputMatch = outputRe.exec(line)) !== null) {
        const inner = outputMatch[1];
        if (!inner.includes('|')) continue;

        const filterNames = extractFilterNames(inner);
        if (filterNames.length === 0) continue;

        // Check the full expression (including filter arguments) for dependency
        filters.push({
          line: lineNum,
          names: filterNames,
          dependsOnIterator: dependsOnIterator(inner, iterators, tainted),
        });
      }
    }

    // Process for-loop closes
    let closeMatch: RegExpExecArray | null;
    forCloseRe.lastIndex = 0;
    while ((closeMatch = forCloseRe.exec(line)) !== null) {
      const scope = loopStack.pop();
      taintedVarsStack.pop();
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

  // Classify each loop
  for (const loop of completedLoops) {
    loop.loopType = classifyLoop(loop.collection);
  }

  return {
    loops: completedLoops,
    filters,
    maxDepth,
    hasAllProducts,
    allProductsLines,
  };
}

export type LoopType = 'safe' | 'risky' | 'critical';

/**
 * Classify loop based on collection expression.
 * Safe: Navigation, blocks, ranges (5-20 items)
 * Risky: Products, collections, search (100+ items)
 * Critical: all_products (deprecated, uncached)
 */
export function classifyLoop(collection: string): LoopType {
  const normalized = collection.toLowerCase().trim();

  // Critical: all_products
  if (normalized.includes('all_products')) {
    return 'critical';
  }

  // Safe patterns: small, bounded collections
  const safePatterns = [
    /\.links$/,                    // menu.links
    /^linklists?\./,               // linklists.main-menu
    /\.blocks$/,                   // section.blocks
    /\.settings\./,                // section.settings.*
    /^\(\d+\.\.\d+\)$/,           // (1..5)
    /^\(0\.\.[\w.]+\.size\)$/,    // (0..array.size)
    /\.blocks\.settings\./,        // block.settings.*
    /^(menus|navigation|header|footer)\./,
  ];

  for (const pattern of safePatterns) {
    if (pattern.test(normalized)) {
      return 'safe';
    }
  }

  // Risky patterns: large collections
  const riskyPatterns = [
    /\.products$/,                 // collection.products
    /^collections$/,               // collections
    /\.results$/,                  // search.results
    /\.items$/,                    // cart.items
    /\.articles$/,                 // blog.articles
    /\.variants$/,                 // product.variants
  ];

  for (const pattern of riskyPatterns) {
    if (pattern.test(normalized)) {
      return 'risky';
    }
  }

  // Default: treat unknown as risky (conservative)
  return 'risky';
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
