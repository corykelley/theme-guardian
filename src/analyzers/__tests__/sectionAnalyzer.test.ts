import { describe, it, expect } from 'vitest';
import { analyzeSections } from '../sectionAnalyzer.js';
import type { FileMeta } from '../../types/report.js';

function section(lines: number, typeCount: number, path = 'sections/test.liquid'): FileMeta {
  // Generate content with the right number of lines and "type": occurrences
  const typeLines = Array.from({ length: typeCount }, (_, i) =>
    `    "type": "block_${i}",`
  );
  const paddingLines = Array.from(
    { length: Math.max(0, lines - typeCount - 1) },
    (_, i) => `<p>Line ${i}</p>`
  );
  const content = [...paddingLines, ...typeLines].join('\n') + '\n';
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
    // Lines > 600 = HIGH, blocks > 10 but <=20 = MEDIUM → combined = HIGH
    const result = analyzeSections(
      [section(650, 15)],
      { maxSectionLines: 400, maxSectionBlocks: 10 },
    );
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('HIGH');
  });
});
