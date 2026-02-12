import { describe, it, expect } from 'vitest';
import { analyzeLoops } from '../loopAnalyzer.js';
import type { FileMeta } from '../../types/report.js';

function file(content: string, path = 'sections/test.liquid'): FileMeta {
  return { path, content, lines: content.split('\n').length };
}

describe('loopAnalyzer', () => {
  it('returns no issues for files without loops', () => {
    const result = analyzeLoops([file('<div>Hello</div>')]);
    expect(result).toHaveLength(0);
  });

  it('produces NO issue for simple loop with iterator-dependent filters', () => {
    const content = `
{% for item in collection.products %}
  <p>{{ item.title | json }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(0);
  });

  it('produces NO issue for simple loop without filters', () => {
    const content = `
{% for item in collection.products %}
  <p>{{ item.title }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(0);
  });

  it('detects hoistable filters (score 3, MEDIUM)', () => {
    const content = `
{% for item in collection.products %}
  <h1>{{ section.settings.title | upcase }}</h1>
  <p>{{ item.title }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(3);
    expect(result[0].severity).toBe('MEDIUM');
    expect(result[0].lineDetails).toEqual({
      forLoops: [2],
      nestedLoops: [],
      hoistableFilters: [3],
      allProducts: [],
    });
  });

  it('detects nested loops (score 5, HIGH)', () => {
    const content = `
{% for collection in collections %}
  {% for product in collection.products %}
    <p>{{ product.title }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(5);
    expect(result[0].severity).toBe('HIGH');
    expect(result[0].depth).toBe(2);
    expect(result[0].lineDetails).toEqual({
      forLoops: [2, 3],
      nestedLoops: [3],
      hoistableFilters: [],
      allProducts: [],
    });
  });

  it('detects nested loops with hoistable filters (score 8, HIGH)', () => {
    const content = `
{% for collection in collections %}
  <h2>{{ section.settings.heading | upcase }}</h2>
  {% for product in collection.products %}
    <p>{{ product.title }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(8); // nested +5, hoistable +3
    expect(result[0].severity).toBe('HIGH');
  });

  it('does not flag nested loops with only iterator-dependent filters', () => {
    const content = `
{% for collection in collections %}
  {% for product in collection.products %}
    <p>{{ product.title | truncate: 50 }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(5); // nested +5 only, no hoistable
    expect(result[0].lineDetails.hoistableFilters).toEqual([]);
  });

  it('detects all_products usage (score 5, HIGH)', () => {
    const content = `
{% for product in all_products %}
  <p>{{ product.title }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(5);
    expect(result[0].severity).toBe('HIGH');
    expect(result[0].message).toContain('all_products');
    expect(result[0].lineDetails).toEqual({
      forLoops: [2],
      nestedLoops: [],
      hoistableFilters: [],
      allProducts: [2],
    });
  });

  it('handles multiple files independently', () => {
    const files = [
      file('<div>No loops</div>', 'sections/clean.liquid'),
      file(`{% for i in (1..5) %}<p>{{ i }}</p>{% endfor %}`, 'sections/loop.liquid'),
    ];
    const result = analyzeLoops(files);
    // Simple loop with no concerns → no issue
    expect(result).toHaveLength(0);
  });

  it('includes nested loop lines in messages', () => {
    const content = `
{% for collection in collections %}
  {% for product in collection.products %}
    <p>{{ product.title }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result[0].message).toContain('Nested loop');
    expect(result[0].message).toContain('line 3');
  });

  it('deduplicates hoistable filter line numbers when multiple filters on same line', () => {
    const content = `
{% for item in collection.products %}
  <p>{{ section.settings.title | upcase }} {{ section.settings.subtitle | downcase }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    // Line 3 has two hoistable filters, but should only appear once
    expect(result[0].lineDetails.hoistableFilters).toEqual([3]);
  });

  it('sequential loops are NOT flagged as nested', () => {
    const content = `
{% for block in section.blocks %}
  <p>{{ block.settings.logo | image_url: 200 }}</p>
{% endfor %}
{% for link in section.settings.terms_menu.links %}
  <a>{{ link.title | link_to: link.url }}</a>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    // Both filters depend on iterators → score 0 → no issue
    expect(result).toHaveLength(0);
  });
});
