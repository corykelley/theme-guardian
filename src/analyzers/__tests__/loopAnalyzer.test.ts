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

  it('detects a simple loop (score 1, LOW)', () => {
    const content = `
{% for item in collection.products %}
  <p>{{ item.title }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(1);
    expect(result[0].severity).toBe('LOW');
    expect(result[0].depth).toBe(1);
  });

  it('detects a loop with filter (score 3, MEDIUM)', () => {
    const content = `
{% for item in collection.products %}
  <p>{{ item.title | upcase }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(3); // loop +1, filter +2
    expect(result[0].severity).toBe('MEDIUM');
  });

  it('detects nested loops (score 4, MEDIUM)', () => {
    const content = `
{% for collection in collections %}
  {% for product in collection.products %}
    <p>{{ product.title }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(4); // loop +1, nested +3
    expect(result[0].severity).toBe('MEDIUM');
    expect(result[0].depth).toBe(2);
  });

  it('detects nested loops with filter (score 6, HIGH)', () => {
    const content = `
{% for collection in collections %}
  {% for product in collection.products %}
    <p>{{ product.title | truncate: 50 }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(6); // loop +1, nested +3, filter +2
    expect(result[0].severity).toBe('HIGH');
  });

  it('detects all_products usage (score 8, HIGH)', () => {
    const content = `
{% for product in all_products %}
  <p>{{ product.title | money }}</p>
{% endfor %}
`;
    const result = analyzeLoops([file(content)]);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(8); // loop +1, filter +2, all_products +5
    expect(result[0].severity).toBe('HIGH');
    expect(result[0].message).toContain('all_products');
  });

  it('handles multiple files independently', () => {
    const files = [
      file('<div>No loops</div>', 'sections/clean.liquid'),
      file('{% for i in (1..5) %}<p>{{ i }}</p>{% endfor %}', 'sections/loop.liquid'),
    ];
    const result = analyzeLoops(files);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('sections/loop.liquid');
  });
});
