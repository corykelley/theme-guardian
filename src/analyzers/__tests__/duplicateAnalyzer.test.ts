import { describe, it, expect } from 'vitest';
import { analyzeDuplicates } from '../duplicateAnalyzer.js';
import type { FileMeta } from '../../types/report.js';

function snippet(name: string, content: string): FileMeta {
  return { path: `snippets/${name}.liquid`, content, lines: content.split('\n').length };
}

describe('duplicateAnalyzer', () => {
  it('returns no issues when all snippets are unique', () => {
    const snippets = [
      snippet('a', '<div>A</div>'),
      snippet('b', '<div>B</div>'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(0);
  });

  it('detects duplicate snippets with identical content', () => {
    const snippets = [
      snippet('icon', '<svg><path d="M1 1"/></svg>'),
      snippet('icon-copy', '<svg><path d="M1 1"/></svg>'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('LOW');
    expect(result[0].snippets).toContain('snippets/icon.liquid');
    expect(result[0].snippets).toContain('snippets/icon-copy.liquid');
  });

  it('detects duplicates ignoring whitespace differences', () => {
    const snippets = [
      snippet('a', '  <div>  Hello  </div>  '),
      snippet('b', '<div> Hello </div>'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(1);
  });

  it('detects duplicates ignoring Liquid comments', () => {
    const snippets = [
      snippet('a', '{% comment %}Author: John{% endcomment %}<div>Hello</div>'),
      snippet('b', '<div>Hello</div>'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(1);
  });

  it('does not flag unique snippets that differ after normalization', () => {
    const snippets = [
      snippet('a', '<div>A</div>'),
      snippet('b', '<div>B</div>'),
      snippet('c', '<span>C</span>'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(0);
  });

  it('does not report empty files as duplicates', () => {
    const snippets = [
      snippet('empty1', ''),
      snippet('empty2', ''),
      snippet('empty3', '  \n  \n  '),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(0);
  });

  it('does not report files that are empty after comment removal as duplicates', () => {
    const snippets = [
      snippet('a', '{% comment %}Author: John{% endcomment %}'),
      snippet('b', '{% comment %}Author: Jane{% endcomment %}'),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(0);
  });

  it('groups more than two duplicates together', () => {
    const content = '<svg viewBox="0 0 24 24"><path/></svg>';
    const snippets = [
      snippet('icon1', content),
      snippet('icon2', content),
      snippet('icon3', content),
    ];
    const result = analyzeDuplicates(snippets);
    expect(result).toHaveLength(1);
    expect(result[0].snippets).toHaveLength(3);
  });
});
