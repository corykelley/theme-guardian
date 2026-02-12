import { describe, it, expect } from 'vitest';
import { analyzeSections } from '../sectionAnalyzer.js';
import type { FileMeta } from '../../types/report.js';

/**
 * Build a realistic section file with a {% schema %} JSON containing
 * the requested number of block type definitions.  The schema also
 * includes settings with their own "type" keys (e.g. "type": "text")
 * which must NOT be counted as blocks.
 */
function section(lines: number, blockCount: number, path = 'sections/test.liquid'): FileMeta {
  const blocks = Array.from({ length: blockCount }, (_, i) => ({
    type: `block_${i}`,
    name: `Block ${i}`,
  }));

  const schema = JSON.stringify(
    {
      name: 'Test Section',
      settings: [
        { type: 'text', id: 'title', label: 'Title' },
        { type: 'select', id: 'style', label: 'Style' },
      ],
      blocks,
    },
    null,
    2,
  );

  const schemaBlock = `{% schema %}\n${schema}\n{% endschema %}`;
  const schemaLines = schemaBlock.split('\n').length;

  const paddingCount = Math.max(0, lines - schemaLines);
  const paddingLines = Array.from({ length: paddingCount }, (_, i) => `<p>Line ${i}</p>`);

  const content = [...paddingLines, schemaBlock].join('\n') + '\n';
  return { path, content, lines: content.split('\n').length };
}

describe('sectionAnalyzer', () => {
  it('returns no issues for small sections', () => {
    const result = analyzeSections(
      [section(50, 3)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(0);
  });

  it('detects MEDIUM severity for lines > 400', () => {
    const result = analyzeSections(
      [section(450, 3)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('MEDIUM');
    expect(result[0].message).toContain('lines');
  });

  it('detects HIGH severity for lines > 600', () => {
    const result = analyzeSections(
      [section(650, 3)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HIGH');
  });

  it('detects MEDIUM severity for blocks > 10', () => {
    const result = analyzeSections(
      [section(50, 15)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('MEDIUM');
    expect(result[0].message).toContain('blocks');
  });

  it('detects HIGH severity for blocks > 20', () => {
    const result = analyzeSections(
      [section(50, 25)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HIGH');
  });

  it('takes highest severity when both lines and blocks exceed thresholds', () => {
    const result = analyzeSections(
      [section(650, 15)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HIGH');
  });

  it('counts zero blocks when schema has settings but no blocks array', () => {
    const content = `<header>Nav</header>\n{% schema %}\n{"name":"Header","settings":[{"type":"text","id":"t","label":"T"}]}\n{% endschema %}\n`;
    const file: FileMeta = { path: 'sections/header.liquid', content, lines: content.split('\n').length };
    const result = analyzeSections([file], { maxSectionLines: 400, maxSectionBlocks: 10 });
    expect(result).toHaveLength(0);
  });

  it('counts zero blocks when file has no schema tag', () => {
    const content = Array.from({ length: 50 }, (_, i) => `<p>Line ${i}</p>`).join('\n');
    const file: FileMeta = { path: 'sections/bare.liquid', content, lines: 50 };
    const result = analyzeSections([file], { maxSectionLines: 400, maxSectionBlocks: 10 });
    expect(result).toHaveLength(0);
  });
});
