# theme-pulse

Architecture and performance analysis for Shopify themes. Catches the Liquid patterns that silently degrade storefront speed and make themes harder to maintain.

```bash
tpulse analyze ./your-theme
```

## Why

Liquid runs server-side on every storefront request. There's no build step, no tree-shaking, no compile-time optimization. Bad patterns ship directly to production and affect every customer on every page load. theme-pulse catches these patterns locally before they get that far.

## Install

```bash
npm install -g theme-pulse
```

Requires Node.js 20+.

## Usage

```bash
# Pretty console output
tpulse analyze ./path/to/theme

# JSON for CI pipelines
tpulse analyze ./path/to/theme --json

# Exit code 1 when HIGH issues exist (opt-in CI gate)
tpulse analyze ./path/to/theme --fail-on=HIGH

# Development — run without building
pnpm dev -- analyze ./path/to/theme
```

By default, tpulse always exits 0. Pass `--fail-on` to opt in to CI gate behavior.

## What it checks

### Loop Performance

Nested loops and expensive operations inside loops are the most common cause of slow Liquid rendering. Every iteration runs server-side per request.

| Pattern              | Score | Impact |
| -------------------- | ----- | ------ |
| Loop exists          | +1    | Adds iteration overhead per request |
| Nested loop          | +3    | O(n*m) iterations compound fast |
| Filter inside loop   | +2    | Each filter runs per iteration |
| `all_products` usage | +5    | Deprecated global — bypasses collection caching with uncached per-handle lookups |

Severity: 0-2 LOW, 3-5 MEDIUM, 6+ HIGH.

**How to fix:**

- **Nested loops:** Flatten into a single loop where possible, or limit the inner collection with `limit:`.
- **Filters inside loops:** Move filter chains to `{% assign %}` tags *before* the loop so they compute once instead of per iteration.
- **`all_products`:** Replace with a specific collection handle or use predictive search. `all_products` is deprecated — it bypasses collection-based caching, each access is an uncached lookup, and it's capped at 20 handles per page.

### Snippet Dependencies

Builds a dependency graph from `{% render %}` and `{% include %}` calls across all snippets. Self-referencing snippets (rendering themselves with different parameters) are excluded as a normal pattern.

- **Depth exceeded** (MEDIUM): render chain deeper than `maxSnippetDepth` (default: 3).
- **Circular dependency** (HIGH): two or more snippets that reference each other in a cycle.

**How to fix:**

- **Deep chains:** Inline the innermost snippet or restructure so the chain is shallower. Each `{% render %}` has overhead (scope creation, variable isolation) and deep chains make the theme harder to reason about.
- **Circular references:** Decide which snippet should own the shared markup and remove the back-reference. Circular renders indicate the two snippets should probably be one, or should share a third extracted snippet.

### Section Complexity

Large sections correlate with slow theme editor performance, difficult PR reviews, and merge conflicts.

| Metric       | MEDIUM | HIGH |
| ------------ | ------ | ---- |
| Line count   | > 400  | > 600 |
| Schema blocks| > 10   | > 20  |

**How to fix:**

- **Too many lines:** Extract repeated markup into snippets. If the section does multiple things (hero + grid + CTA), split it into focused sections.
- **Too many blocks:** Group related block types or split the section. Merchants struggle with complex section editors, and every block adds to the JSON payload Shopify parses in the theme customizer.

### Duplicate Snippets

Compares SHA256 hashes of normalized snippet content (comments stripped, whitespace collapsed). Duplicate groups are flagged as LOW.

**How to fix:**

Consolidate into a single snippet and update all `{% render %}` calls. Duplicates cause drift -- one copy gets updated, the other doesn't, and now you have a subtle bug nobody notices for weeks.

## Configuration

Optional `theme-pulse.config.json` in your theme's root:

```json
{
  "maxSnippetDepth": 3,
  "maxSectionLines": 400,
  "maxSectionBlocks": 10,
  "failOn": "HIGH"
}
```

| Key               | Default  | Description |
| ----------------- | -------- | ----------- |
| `maxSnippetDepth` | 3        | Max allowed render depth before flagging |
| `maxSectionLines` | 400      | Line count threshold for MEDIUM |
| `maxSectionBlocks`| 10       | Block count threshold for MEDIUM |
| `failOn`          | *(none)* | Set to `LOW`, `MEDIUM`, or `HIGH` to enable CI exit code 1 |

Precedence: built-in defaults < config file < CLI flags.

## Exit Codes

| Code | Meaning |
| ---- | ------- |
| 0    | Default. Always 0 unless `--fail-on` is set. |
| 1    | `--fail-on` is set and matching issues were found. |

## JSON Output

```json
{
  "meta": {
    "sections": 28,
    "snippets": 45,
    "templates": 12
  },
  "summary": {
    "totalIssues": 5,
    "high": 2,
    "medium": 1,
    "low": 2
  },
  "issues": {
    "loops": [
      {
        "file": "sections/product-accordions.liquid",
        "depth": 3,
        "score": 6,
        "severity": "HIGH",
        "message": "Nested loop detected with filter usage",
        "hint": "Flatten the nested loop and move filters to assign tags above the loop"
      }
    ],
    "snippets": [],
    "sections": [],
    "duplicates": []
  }
}
```

## License

MIT
