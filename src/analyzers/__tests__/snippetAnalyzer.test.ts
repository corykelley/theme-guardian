import { describe, it, expect } from 'vitest';
import { analyzeSnippets } from '../snippetAnalyzer.js';
import { buildSnippetGraph } from '../../core/graphBuilder.js';
import type { FileMeta } from '../../types/report.js';

function snippet(name: string, content: string): FileMeta {
  return { path: `snippets/${name}.liquid`, content, lines: content.split('\n').length };
}

describe('snippetAnalyzer', () => {
  it('returns no issues for a flat graph', () => {
    const snippets = [
      snippet('a', '<div>A</div>'),
      snippet('b', '<div>B</div>'),
    ];
    const graph = buildSnippetGraph(snippets);
    const issues = analyzeSnippets(graph, { maxSnippetDepth: 3 });
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for depth within threshold', () => {
    const snippets = [
      snippet('a', "{% render 'b' %}"),
      snippet('b', "{% render 'c' %}"),
      snippet('c', '<div>C</div>'),
    ];
    const graph = buildSnippetGraph(snippets);
    // Depth from a -> b -> c is 2, which is within maxSnippetDepth of 3
    const issues = analyzeSnippets(graph, { maxSnippetDepth: 3 });
    expect(issues).toHaveLength(0);
  });

  it('detects depth exceeded', () => {
    const snippets = [
      snippet('a', "{% render 'b' %}"),
      snippet('b', "{% render 'c' %}"),
      snippet('c', "{% render 'd' %}"),
      snippet('d', '<div>D</div>'),
    ];
    const graph = buildSnippetGraph(snippets);
    // Depth: a -> b -> c -> d is 3 edges, within threshold of 3
    // With maxSnippetDepth of 2, the chain a -> b -> c (depth 2) is ok,
    // but a -> b -> c -> d (depth 3) exceeds
    const issues = analyzeSnippets(graph, { maxSnippetDepth: 2 });
    const depthIssues = issues.filter((i) => i.type === 'DEPTH_EXCEEDED');
    expect(depthIssues.length).toBeGreaterThan(0);
    expect(depthIssues[0].severity).toBe('MEDIUM');
  });

  it('detects circular dependencies', () => {
    const snippets = [
      snippet('nav', "{% render 'nav-item' %}"),
      snippet('nav-item', "{% render 'nav' %}"),
    ];
    const graph = buildSnippetGraph(snippets);
    const issues = analyzeSnippets(graph, { maxSnippetDepth: 3 });
    const circular = issues.filter((i) => i.type === 'CIRCULAR');
    expect(circular.length).toBeGreaterThan(0);
    expect(circular[0].severity).toBe('HIGH');
    expect(circular[0].chain).toContain('nav');
    expect(circular[0].chain).toContain('nav-item');
  });

  it('ignores self-referencing snippets (common Liquid pattern)', () => {
    const snippets = [
      snippet('recursive', "{% render 'recursive' %}"),
    ];
    const graph = buildSnippetGraph(snippets);
    const issues = analyzeSnippets(graph, { maxSnippetDepth: 3 });
    // Self-references are excluded at the graph level -- not a real circular dep
    expect(issues).toHaveLength(0);
  });
});
