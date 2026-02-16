import { describe, it, expect } from 'vitest';
import { detectForLoops, detectRenderCalls, stripCommentBlocks, classifyLoop } from '../liquidParser.js';

describe('detectForLoops', () => {
  it('returns depth 0 for content without loops', () => {
    const result = detectForLoops('<div>Hello</div>');
    expect(result.maxDepth).toBe(0);
    expect(result.loops).toEqual([]);
    expect(result.filters).toEqual([]);
    expect(result.hasAllProducts).toBe(false);
    expect(result.allProductsLines).toEqual([]);
  });

  it('detects single loop with iterator name', () => {
    const content = `
{% for item in items %}
  <p>{{ item.name }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(1);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]).toMatchObject({
      openLine: 2,
      closeLine: 4,
      depth: 1,
      iterator: 'item',
    });
  });

  it('detects nested loops with correct depths', () => {
    const content = `
{% for outer in outers %}
  {% for inner in inners %}
    <p>{{ inner }}</p>
  {% endfor %}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(2);
    expect(result.loops).toHaveLength(2);
    expect(result.loops[0]).toMatchObject({ openLine: 2, depth: 1, iterator: 'outer' });
    expect(result.loops[1]).toMatchObject({ openLine: 3, depth: 2, iterator: 'inner' });
  });

  it('detects sequential loops as independent (not nested)', () => {
    const content = `
{% for block in section.blocks %}
  <p>{{ block.title }}</p>
{% endfor %}
{% for link in section.settings.links %}
  <a>{{ link.title }}</a>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(1);
    expect(result.loops).toHaveLength(2);
    expect(result.loops[0]).toMatchObject({ depth: 1, iterator: 'block' });
    expect(result.loops[1]).toMatchObject({ depth: 1, iterator: 'link' });
  });

  it('marks iterator-dependent filters as dependsOnIterator: true', () => {
    const content = `
{% for item in items %}
  <p>{{ item.name | upcase }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0]).toMatchObject({
      line: 3,
      names: ['upcase'],
      dependsOnIterator: true,
    });
  });

  it('marks non-iterator filters as dependsOnIterator: false', () => {
    const content = `
{% for item in items %}
  <p>{{ section.settings.title | upcase }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0]).toMatchObject({
      line: 3,
      names: ['upcase'],
      dependsOnIterator: false,
    });
  });

  it('does not collect filters outside loops', () => {
    const content = `
<p>{{ title | upcase }}</p>
{% for item in items %}
  <p>{{ item.name }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toEqual([]);
  });

  it('detects all_products inside loop', () => {
    const content = `
{% for product in all_products %}
  <p>{{ product.title }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.hasAllProducts).toBe(true);
    expect(result.allProductsLines).toEqual([2]);
  });

  it('handles whitespace-trimming tags', () => {
    const content = `
{%- for item in items -%}
  <p>{{ item.name }}</p>
{%- endfor -%}
`;
    const result = detectForLoops(content);
    expect(result.maxDepth).toBe(1);
    expect(result.loops[0]).toMatchObject({ openLine: 2, iterator: 'item' });
  });

  it('extracts multiple filter names in a chain', () => {
    const content = `
{% for item in items %}
  <img src="{{ item.image | image_url: 200 | image_tag }}">
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].names).toEqual(['image_url', 'image_tag']);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('tracks multiple filter hits across lines', () => {
    const content = `
{% for item in items %}
  <p>{{ item.name | upcase }}</p>
  <p>{{ item.desc | truncate: 100 }}</p>
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(2);
    expect(result.filters[0].line).toBe(3);
    expect(result.filters[1].line).toBe(4);
  });

  it('correctly handles nested iterators for dependency check', () => {
    const content = `
{% for collection in collections %}
  <h2>{{ collection.title | upcase }}</h2>
  {% for product in collection.products %}
    <p>{{ product.title | truncate: 50 }}</p>
    <span>{{ section.settings.label | upcase }}</span>
  {% endfor %}
{% endfor %}
`;
    const result = detectForLoops(content);
    // collection.title | upcase → depends on "collection" iterator
    expect(result.filters[0]).toMatchObject({ line: 3, dependsOnIterator: true });
    // product.title | truncate → depends on "product" iterator
    expect(result.filters[1]).toMatchObject({ line: 5, dependsOnIterator: true });
    // section.settings.label | upcase → does NOT depend on any iterator
    expect(result.filters[2]).toMatchObject({ line: 6, dependsOnIterator: false });
  });

  it('marks assign-based indirect dependency as dependsOnIterator: true', () => {
    const content = `
{% for i in (1..5) %}
  {% assign key = 'image_' | append: i %}
  {{ section.settings[key] | img_url }}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('marks forloop.index dependency as dependsOnIterator: true', () => {
    const content = `
{% for item in items %}
  {{ forloop.index | minus: 1 }}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('marks transitive assign dependency as dependsOnIterator: true', () => {
    const content = `
{% for block in section.blocks %}
  {% assign a = block.settings.product %}
  {% assign b = a.media %}
  {{ b | img_url }}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('strips commented-out code before analysis', () => {
    const content = `
{% comment %}
{% for item in items %}
  {{ section.settings.title | upcase }}
{% endfor %}
{% endcomment %}
{% for real in things %}
  {{ real.name | downcase }}
{% endfor %}
`;
    const result = detectForLoops(content);
    // Only the real loop should be detected, not the commented-out one
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0].iterator).toBe('real');
    // The only filter should be from the real loop
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('marks block-scoped lookup via assign as dependsOnIterator: true', () => {
    const content = `
{% for block in section.blocks %}
  {% assign product = block.settings.product %}
  {{ product.featured_media | image_url }}
{% endfor %}
`;
    const result = detectForLoops(content);
    expect(result.filters).toHaveLength(1);
    expect(result.filters[0].dependsOnIterator).toBe(true);
  });

  it('captures collection expressions', () => {
    const content = `{% for product in collection.products %}{% endfor %}`;
    const result = detectForLoops(content);
    expect(result.loops[0].collection).toBe('collection.products');
  });

  it('captures navigation expressions', () => {
    const content = `{% for link in section.settings.menu.links %}{% endfor %}`;
    const result = detectForLoops(content);
    expect(result.loops[0].collection).toBe('section.settings.menu.links');
  });

  it('captures expressions with limit', () => {
    const content = `{% for item in items limit: 10 %}{% endfor %}`;
    const result = detectForLoops(content);
    expect(result.loops[0].collection).toBe('items');
  });

  it('captures expressions with offset', () => {
    const content = `{% for item in items offset: 5 %}{% endfor %}`;
    const result = detectForLoops(content);
    expect(result.loops[0].collection).toBe('items');
  });
});

describe('classifyLoop', () => {
  it('classifies navigation as safe', () => {
    expect(classifyLoop('section.settings.menu.links')).toBe('safe');
    expect(classifyLoop('section.blocks')).toBe('safe');
    expect(classifyLoop('linklists.main-menu.links')).toBe('safe');
  });

  it('classifies collections as risky', () => {
    expect(classifyLoop('collection.products')).toBe('risky');
    expect(classifyLoop('search.results')).toBe('risky');
    expect(classifyLoop('collections')).toBe('risky');
  });

  it('classifies all_products as critical', () => {
    expect(classifyLoop('all_products')).toBe('critical');
    expect(classifyLoop('collections.all_products')).toBe('critical');
  });

  it('classifies ranges as safe', () => {
    expect(classifyLoop('(1..5)')).toBe('safe');
    expect(classifyLoop('(0..array.size)')).toBe('safe');
  });

  it('defaults unknown patterns to risky', () => {
    expect(classifyLoop('unknown_collection')).toBe('risky');
    expect(classifyLoop('custom.items')).toBe('risky');
  });
});

describe('stripCommentBlocks', () => {
  it('detects large comment blocks (>5 lines)', () => {
    const content = `<div>
{% comment %}
line 1
line 2
line 3
line 4
line 5
{% endcomment %}
</div>`;
    const result = stripCommentBlocks(content);
    expect(result.largeComments).toHaveLength(1);
    expect(result.largeComments[0]).toEqual({ line: 2, lineCount: 7 });
  });

  it('ignores small comment blocks (<=5 lines)', () => {
    const content = `<div>
{% comment %}
Author: John
{% endcomment %}
</div>`;
    const result = stripCommentBlocks(content);
    expect(result.largeComments).toHaveLength(0);
  });

  it('preserves line numbering after stripping', () => {
    const content = `line1
{% comment %}
removed
{% endcomment %}
line5`;
    const result = stripCommentBlocks(content);
    expect(result.cleaned.split('\n').length).toBe(content.split('\n').length);
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
