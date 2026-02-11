import { describe, it, expect } from 'vitest';
import { detectForLoops, detectRenderCalls } from '../liquidParser.js';

describe('detectForLoops', () => {
  it('returns depth 0 for content without loops', () => {
    const result = detectForLoops('<div>Hello</div>');
    expect(result.maxDepth).toBe(0);
    expect(result.hasFilterInsideLoop).toBe(false);
    expect(result.hasAllProducts).toBe(false);
  });

  it('detects single loop', () => {
    const content = `
{% for item in items %}
  <p>{{ item.name }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(1);
  });

  it('detects nested loops', () => {
    const content = `
{% for outer in outers %}
  {% for inner in inners %}
    <p>{{ inner }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(2);
  });

  it('detects filter inside loop', () => {
    const content = `
{% for item in items %}
  <p>{{ item.name | upcase }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.hasFilterInsideLoop).toBe(true);
  });

  it('does not flag filter outside loop', () => {
    const content = `
<p>{{ title | upcase }}</p>
{% for item in items %}
  <p>{{ item.name }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.hasFilterInsideLoop).toBe(false);
  });

  it('detects all_products inside loop', () => {
    const content = `
{% for product in all_products %}
  <p>{{ product.title }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.hasAllProducts).toBe(true);
  });

  it('handles whitespace-trimming tags', () => {
    const content = `
{%- for item in items -%}
  <p>{{ item.name }}</p>
{%- endfor -%}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(1);
  });
});

describe('detectRenderCalls', () => {
  it('returns empty for content without render/include', () => {
    const result = detectRenderCalls('<div>Hello</div>');
    expect(result).toHaveLength(0);
  });

  it('detects render calls with single quotes', () => {
    const result = detectRenderCalls("{% render 'icon' %}");
    expect(result).toHaveLength(1);
    expect(result[0].snippetName).toBe('icon');
    expect(result[0].type).toBe('render');
  });

  it('detects render calls with double quotes', () => {
    const result = detectRenderCalls('{% render "icon" %}');
    expect(result).toHaveLength(1);
    expect(result[0].snippetName).toBe('icon');
  });

  it('detects include calls', () => {
    const result = detectRenderCalls("{% include 'header' %}");
    expect(result).toHaveLength(1);
    expect(result[0].snippetName).toBe('header');
    expect(result[0].type).toBe('include');
  });

  it('detects multiple calls', () => {
    const content = `
{% render 'icon' %}
{% render 'nav' %}
{% include 'footer' %}
`;
    const result = detectRenderCalls(content);
    expect(result).toHaveLength(3);
  });

  it('handles whitespace-trimming tags', () => {
    const result = detectRenderCalls("{%- render 'icon' -%}");
    expect(result).toHaveLength(1);
    expect(result[0].snippetName).toBe('icon');
  });
});
