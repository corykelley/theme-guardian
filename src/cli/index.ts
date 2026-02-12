import { Command } from 'commander';
import type { Severity } from '../types/report.js';
import { scanThemeFiles } from '../core/fileScanner.js';
import { buildSnippetGraph } from '../core/graphBuilder.js';
import { buildReport, shouldFail } from '../core/scoring.js';
import { resolveConfig } from '../utils/config.js';
import { printReport, loopHint, snippetHint, sectionHint, commentBlockHint } from '../utils/logger.js';
import { analyzeLoops, detectCommentBlocks } from '../analyzers/loopAnalyzer.js';
import { analyzeSnippets } from '../analyzers/snippetAnalyzer.js';
import { analyzeSections } from '../analyzers/sectionAnalyzer.js';
import { analyzeDuplicates } from '../analyzers/duplicateAnalyzer.js';

const VALID_SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH'];

function parseSeverity(value: string): Severity {
  const upper = value.toUpperCase();
  if (VALID_SEVERITIES.includes(upper as Severity)) {
    return upper as Severity;
  }
  throw new Error(`Invalid severity: ${value}. Must be one of: LOW, MEDIUM, HIGH`);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('theme-guardian')
    .description('Opinionated architecture and performance analysis for Shopify themes')
    .version('0.1.0');

  program
    .command('analyze')
    .description('Analyze a Shopify theme directory')
    .argument('<theme-path>', 'Path to the Shopify theme directory')
    .option('--json', 'Output report as JSON', false)
    .option('--fail-on <severity>', 'Exit with code 1 if issues at or above this severity exist')
    .action((themePath: string, opts: { json: boolean; failOn?: string }) => {
      // Resolve config: defaults < config file < CLI flags
      const cliOverrides = opts.failOn
        ? { failOn: parseSeverity(opts.failOn) }
        : {};
      const config = resolveConfig(themePath, cliOverrides);

      // Scan theme files
      const themeFiles = scanThemeFiles(themePath);

      // Run analyzers
      const analysisFiles = [
        ...themeFiles.sections,
        ...themeFiles.templates,
      ];
      const loopIssues = analyzeLoops(analysisFiles);
      const commentBlockIssues = detectCommentBlocks(analysisFiles);

      const snippetGraph = buildSnippetGraph(themeFiles.snippets);
      const snippetIssues = analyzeSnippets(snippetGraph, {
        maxSnippetDepth: config.maxSnippetDepth,
      });

      const sectionIssues = analyzeSections(themeFiles.sections, {
        maxSectionLines: config.maxSectionLines,
        maxSectionBlocks: config.maxSectionBlocks,
      });

      const duplicateIssues = analyzeDuplicates(themeFiles.snippets);

      // Build report
      const report = buildReport(
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

      // Output
      if (opts.json) {
        const jsonReport = {
          ...report,
          issues: {
            loops: report.issues.loops.map((i) => ({ ...i, hint: loopHint(i) })),
            snippets: report.issues.snippets.map((i) => ({ ...i, hint: snippetHint(i) })),
            sections: report.issues.sections.map((i) => ({ ...i, hint: sectionHint(i) })),
            duplicates: report.issues.duplicates.map((i) => ({ ...i, hint: 'Consolidate into a single snippet' })),
            commentBlocks: report.issues.commentBlocks.map((i) => ({ ...i, hint: commentBlockHint(i) })),
          },
        };
        process.stdout.write(JSON.stringify(jsonReport, null, 2) + '\n');
      } else {
        printReport(report);
      }

      // CI fail behavior -- only when explicitly requested
      if (config.failOn && shouldFail(config.failOn, report)) {
        process.exit(1);
      }
    });

  return program;
}
