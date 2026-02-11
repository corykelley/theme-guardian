import { describe, it, expect } from 'vitest';
import { buildReport, shouldFail, severityRank } from '../scoring.js';

describe('severityRank', () => {
  it('ranks LOW < MEDIUM < HIGH', () => {
    expect(severityRank('LOW')).toBeLessThan(severityRank('MEDIUM'));
    expect(severityRank('MEDIUM')).toBeLessThan(severityRank('HIGH'));
  });
});

describe('buildReport', () => {
  it('computes summary from issue arrays', () => {
    const report = buildReport({
      loops: [
        { file: 'a.liquid', depth: 2, score: 6, severity: 'HIGH', message: 'test' },
        { file: 'b.liquid', depth: 1, score: 1, severity: 'LOW', message: 'test' },
      ],
      snippets: [
        { type: 'CIRCULAR', chain: ['a', 'b', 'a'], severity: 'HIGH' },
      ],
      sections: [
        { file: 'c.liquid', lines: 500, blocks: 5, severity: 'MEDIUM', message: 'test' },
      ],
      duplicates: [
        { hash: 'abc', snippets: ['x.liquid', 'y.liquid'], severity: 'LOW' },
      ],
    });

    expect(report.summary.totalIssues).toBe(5);
    expect(report.summary.high).toBe(2);
    expect(report.summary.medium).toBe(1);
    expect(report.summary.low).toBe(2);
  });

  it('returns zero counts for empty issues', () => {
    const report = buildReport({
      loops: [],
      snippets: [],
      sections: [],
      duplicates: [],
    });
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.high).toBe(0);
    expect(report.summary.medium).toBe(0);
    expect(report.summary.low).toBe(0);
  });
});

describe('shouldFail', () => {
  it('returns true when issues at threshold severity exist', () => {
    const report = buildReport({
      loops: [
        { file: 'a.liquid', depth: 2, score: 6, severity: 'HIGH', message: 'test' },
      ],
      snippets: [],
      sections: [],
      duplicates: [],
    });
    expect(shouldFail('HIGH', report)).toBe(true);
  });

  it('returns true when issues above threshold severity exist', () => {
    const report = buildReport({
      loops: [
        { file: 'a.liquid', depth: 2, score: 6, severity: 'HIGH', message: 'test' },
      ],
      snippets: [],
      sections: [],
      duplicates: [],
    });
    expect(shouldFail('MEDIUM', report)).toBe(true);
  });

  it('returns false when no issues at or above threshold', () => {
    const report = buildReport({
      loops: [
        { file: 'a.liquid', depth: 1, score: 1, severity: 'LOW', message: 'test' },
      ],
      snippets: [],
      sections: [],
      duplicates: [],
    });
    expect(shouldFail('HIGH', report)).toBe(false);
    expect(shouldFail('MEDIUM', report)).toBe(false);
  });

  it('returns true for LOW threshold with LOW issues', () => {
    const report = buildReport({
      loops: [],
      snippets: [],
      sections: [],
      duplicates: [
        { hash: 'abc', snippets: ['x.liquid', 'y.liquid'], severity: 'LOW' },
      ],
    });
    expect(shouldFail('LOW', report)).toBe(true);
  });

  it('returns false for empty report', () => {
    const report = buildReport({
      loops: [],
      snippets: [],
      sections: [],
      duplicates: [],
    });
    expect(shouldFail('LOW', report)).toBe(false);
  });
});
