import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { scanThemeFiles } from '../../core/fileScanner.js';
import { buildSnippetGraph } from '../../core/graphBuilder.js';
import { buildReport, shouldFail } from '../../core/scoring.js';
import { analyzeLoops, detectCommentBlocks } from '../../analyzers/loopAnalyzer.js';
import { analyzeSnippets } from '../../analyzers/snippetAnalyzer.js';
import { analyzeSections } from '../../analyzers/sectionAnalyzer.js';
import { analyzeDuplicates } from '../../analyzers/duplicateAnalyzer.js';
import { resolveConfig } from '../../utils/config.js';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures');

function runAnalysis(themePath: string) {
  const config = resolveConfig(themePath);
  const themeFiles = scanThemeFiles(themePath);

  const analysisFiles = [
    ...themeFiles.sections,
    ...themeFiles.templates,
  ];
  const loopIssues = analyzeLoops(analysisFiles);
  const commentBlockIssues = detectCommentBlocks(analysisFiles);
  const graph = buildSnippetGraph(themeFiles.snippets);
  const snippetIssues = analyzeSnippets(graph, {
    maxSnippetDepth: config.maxSnippetDepth,
  });
  const sectionIssues = analyzeSections(themeFiles.sections, {
    maxSectionLines: config.maxSectionLines,
    maxSectionBlocks: config.maxSectionBlocks,
  });
  const duplicateIssues = analyzeDuplicates(themeFiles.snippets);

  return buildReport(
    {
      loops: loopIssues,
      snippets: snippetIssues,
      sections: sectionIssues,
      duplicates: duplicateIssues,
      commentBlocks: commentBlockIssues,
    },
    {
      sections: themeFiles.sections.length,
      snippets: themeFiles.snippets.length,
      templates: themeFiles.templates.length,
    },
  );
}

describe('Integration: simple-theme', () => {
  it('detects duplicate snippets only', () => {
    const report = runAnalysis(resolve(FIXTURES, 'simple-theme'));
    expect(report.issues.loops).toHaveLength(0);
    expect(report.issues.snippets).toHaveLength(0);
    expect(report.issues.sections).toHaveLength(0);
    // icon.liquid and icon-copy.liquid are duplicates
    expect(report.issues.duplicates.length).toBeGreaterThanOrEqual(1);
    expect(report.summary.low).toBeGreaterThanOrEqual(1);
  });

  it('does not fail on HIGH for simple theme', () => {
    const report = runAnalysis(resolve(FIXTURES, 'simple-theme'));
    expect(shouldFail('HIGH', report)).toBe(false);
  });
});

describe('Integration: nested-loop-theme', () => {
  it('detects loop issues', () => {
    const report = runAnalysis(resolve(FIXTURES, 'nested-loop-theme'));
    expect(report.issues.loops.length).toBeGreaterThan(0);

    const highLoops = report.issues.loops.filter((i) => i.severity === 'HIGH');
    expect(highLoops.length).toBeGreaterThan(0);
  });

  it('fails on HIGH with loop issues', () => {
    const report = runAnalysis(resolve(FIXTURES, 'nested-loop-theme'));
    expect(shouldFail('HIGH', report)).toBe(true);
  });
});

describe('Integration: circular-snippet-theme', () => {
  it('detects circular snippet dependencies', () => {
    const report = runAnalysis(resolve(FIXTURES, 'circular-snippet-theme'));
    const circular = report.issues.snippets.filter((i) => i.type === 'CIRCULAR');
    expect(circular.length).toBeGreaterThan(0);
    expect(circular[0].severity).toBe('HIGH');
  });

  it('detects depth exceeded for deep chain', () => {
    const report = runAnalysis(resolve(FIXTURES, 'circular-snippet-theme'));
    const depth = report.issues.snippets.filter((i) => i.type === 'DEPTH_EXCEEDED');
    expect(depth.length).toBeGreaterThan(0);
  });

  it('fails on HIGH with circular issues', () => {
    const report = runAnalysis(resolve(FIXTURES, 'circular-snippet-theme'));
    expect(shouldFail('HIGH', report)).toBe(true);
  });
});

describe('Integration: large-section-theme', () => {
  it('detects large section issues', () => {
    const report = runAnalysis(resolve(FIXTURES, 'large-section-theme'));
    expect(report.issues.sections.length).toBeGreaterThan(0);
    const highSections = report.issues.sections.filter((i) => i.severity === 'HIGH');
    expect(highSections.length).toBeGreaterThan(0);
  });

  it('fails on HIGH with large section issues', () => {
    const report = runAnalysis(resolve(FIXTURES, 'large-section-theme'));
    expect(shouldFail('HIGH', report)).toBe(true);
  });
});

describe('JSON output conformance', () => {
  it('produces a valid ThemePulseReport shape', () => {
    const report = runAnalysis(resolve(FIXTURES, 'nested-loop-theme'));

    // Verify shape
    expect(report).toHaveProperty('meta');
    expect(report.meta).toHaveProperty('sections');
    expect(report.meta).toHaveProperty('snippets');
    expect(report.meta).toHaveProperty('templates');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('issues');
    expect(report.summary).toHaveProperty('totalIssues');
    expect(report.summary).toHaveProperty('high');
    expect(report.summary).toHaveProperty('medium');
    expect(report.summary).toHaveProperty('low');
    expect(report.issues).toHaveProperty('loops');
    expect(report.issues).toHaveProperty('snippets');
    expect(report.issues).toHaveProperty('sections');
    expect(report.issues).toHaveProperty('duplicates');

    // Verify JSON serialization round-trips cleanly
    const json = JSON.stringify(report);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(report);
  });
});
