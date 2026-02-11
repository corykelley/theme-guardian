import chalk from 'chalk';
import type {
  Severity,
  ThemeGuardianReport,
  LoopIssue,
  SnippetGraphIssue,
  SectionIssue,
  DuplicateSnippetIssue,
} from '../types/report.js';

// ── Constants ───────────────────────────────────────────────────────

const P = '  ';          // outer padding
const I = '    ';         // item indent
const D = '      ';      // detail indent
const RULE_W = 58;

const SEVERITY_ORDER: Severity[] = ['HIGH', 'MEDIUM', 'LOW'];

// ── Primitives ──────────────────────────────────────────────────────

const rule = () => chalk.dim('─'.repeat(RULE_W));
const nl = () => console.log('');

function icon(s: Severity): string {
  if (s === 'HIGH') return chalk.red('✖');
  if (s === 'MEDIUM') return chalk.yellow('▲');
  return chalk.blue('●');
}

function badge(s: Severity): string {
  if (s === 'HIGH') return chalk.red.bold('HIGH');
  if (s === 'MEDIUM') return chalk.yellow.bold('MEDIUM');
  return chalk.blue.bold('LOW');
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function bySeverity<T extends { severity: Severity }>(items: T[]): Map<Severity, T[]> {
  const map = new Map<Severity, T[]>();
  for (const s of SEVERITY_ORDER) map.set(s, []);
  for (const item of items) map.get(item.severity)!.push(item);
  return map;
}

function padEnd(str: string, len: number): string {
  const visible = str.replace(/\x1B\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

// ── Section header ──────────────────────────────────────────────────

function sectionTitle(title: string, count: number): void {
  nl();
  const left = `${P}${chalk.bold(title)}`;
  const right = chalk.dim(plural(count, 'issue'));
  const leftLen = title.length + P.length;
  const gap = Math.max(2, RULE_W - leftLen - right.replace(/\x1B\[[0-9;]*m/g, '').length + P.length);
  console.log(left + ' '.repeat(gap) + right);
  console.log(P + rule());
}

// ── Severity group header ───────────────────────────────────────────

function severityHeader(severity: Severity, count: number): void {
  nl();
  console.log(`${P}${badge(severity)}  ${chalk.dim(String(count))}`);
}

// ── Remediation hints ───────────────────────────────────────────────

export function loopHint(issue: LoopIssue): string {
  if (issue.message.includes('all_products')) {
    return 'Replace all_products with a specific collection — it bypasses caching with uncached per-handle lookups';
  }
  if (issue.depth >= 2 && issue.message.includes('filter')) {
    return 'Flatten the nested loop and move filters to assign tags above the loop';
  }
  if (issue.depth >= 2) {
    return 'Flatten into a single loop or limit the inner collection with limit:';
  }
  if (issue.message.includes('filter')) {
    return 'Move filters to assign tags before the loop so they compute once';
  }
  return 'Consider limiting the collection size or paginating';
}

export function sectionHint(issue: SectionIssue): string {
  const bigLines = issue.lines > 600;
  const bigBlocks = issue.blocks > 20;
  if (bigLines && bigBlocks) {
    return 'Split into focused sections and extract repeated markup into snippets';
  }
  if (bigLines) {
    return 'Break into smaller sections — extract reusable markup into snippets';
  }
  if (bigBlocks) {
    return 'Reduce schema blocks — group related options or split into multiple sections';
  }
  if (issue.lines > 400 && issue.blocks > 10) {
    return 'Consider splitting — this section is growing complex';
  }
  if (issue.lines > 400) {
    return 'Section is getting large — consider extracting markup into snippets';
  }
  return 'Schema is growing — consider grouping related block types';
}

export function snippetHint(issue: SnippetGraphIssue): string {
  if (issue.type === 'CIRCULAR') {
    return 'Break the cycle — one snippet should own the shared markup';
  }
  return 'Flatten the render chain to reduce nesting and improve maintainability';
}

// ── Loop tags for compact view ──────────────────────────────────────

function loopTags(issue: LoopIssue): string {
  const tags: string[] = [];
  if (issue.depth >= 2) tags.push('nested');
  if (issue.message.includes('filter')) tags.push('filters');
  if (issue.message.includes('all_products')) tags.push('all_products');
  if (tags.length === 0) tags.push('simple loop');
  return chalk.dim(tags.join(' · '));
}

// ── Loop section ────────────────────────────────────────────────────

function printLoops(issues: LoopIssue[]): void {
  if (issues.length === 0) return;
  sectionTitle('Loop Performance', issues.length);

  const groups = bySeverity(issues);

  // HIGH — full detail with hint
  const high = groups.get('HIGH')!;
  if (high.length > 0) {
    severityHeader('HIGH', high.length);
    for (const issue of high) {
      nl();
      console.log(`${I}${icon(issue.severity)}  ${chalk.white(issue.file)}`);
      console.log(`${D}${chalk.dim(issue.message)}  ${chalk.dim('·')}  ${chalk.dim(`score ${issue.score}`)}  ${chalk.dim('·')}  ${chalk.dim(`depth ${issue.depth}`)}`);
      console.log(`${D}${chalk.cyan('→')} ${chalk.cyan(loopHint(issue))}`);
    }
  }

  // MEDIUM — compact one-liner with aligned tags
  const med = groups.get('MEDIUM')!;
  if (med.length > 0) {
    severityHeader('MEDIUM', med.length);
    const maxFile = Math.max(...med.map((i) => i.file.length));
    const colW = Math.min(maxFile + 2, 48);
    nl();
    for (const issue of med) {
      console.log(`${I}${icon(issue.severity)}  ${padEnd(chalk.white(issue.file), colW)} ${loopTags(issue)}`);
    }
  }

  // LOW — collapsed count
  const low = groups.get('LOW')!;
  if (low.length > 0) {
    severityHeader('LOW', low.length);
    nl();
    console.log(`${I}${icon('LOW')}  ${chalk.dim(`${low.length} file${low.length === 1 ? '' : 's'} with simple loops`)}`);
  }
}

// ── Snippet section ─────────────────────────────────────────────────

function printSnippets(issues: SnippetGraphIssue[]): void {
  if (issues.length === 0) return;
  sectionTitle('Snippet Dependencies', issues.length);

  const groups = bySeverity(issues);

  // HIGH (circular) — full detail with hint
  const high = groups.get('HIGH')!;
  if (high.length > 0) {
    severityHeader('HIGH', high.length);
    for (const issue of high) {
      nl();
      console.log(`${I}${icon(issue.severity)}  ${chalk.white('Circular dependency')}`);
      console.log(`${D}${chalk.dim(issue.chain.join(' → '))}`);
      console.log(`${D}${chalk.cyan('→')} ${chalk.cyan(snippetHint(issue))}`);
    }
  }

  // MEDIUM (depth) — compact
  const med = groups.get('MEDIUM')!;
  if (med.length > 0) {
    severityHeader('MEDIUM', med.length);
    for (const issue of med) {
      nl();
      console.log(`${I}${icon(issue.severity)}  ${chalk.white('Depth exceeded')}  ${chalk.dim(issue.chain.join(' → '))}`);
    }
  }
}

// ── Section complexity ──────────────────────────────────────────────

function sectionMetrics(issue: SectionIssue): string {
  return chalk.dim(`${issue.lines} lines · ${issue.blocks} blocks`);
}

function printSections(issues: SectionIssue[]): void {
  if (issues.length === 0) return;
  sectionTitle('Section Complexity', issues.length);

  const groups = bySeverity(issues);

  // HIGH — detail with hint
  const high = groups.get('HIGH')!;
  if (high.length > 0) {
    severityHeader('HIGH', high.length);
    const maxFile = Math.max(...high.map((i) => i.file.length));
    const colW = Math.min(maxFile + 2, 48);
    for (const issue of high) {
      nl();
      console.log(`${I}${icon(issue.severity)}  ${padEnd(chalk.white(issue.file), colW)} ${sectionMetrics(issue)}`);
      console.log(`${D}${chalk.cyan('→')} ${chalk.cyan(sectionHint(issue))}`);
    }
  }

  // MEDIUM — compact one-liner
  const med = groups.get('MEDIUM')!;
  if (med.length > 0) {
    severityHeader('MEDIUM', med.length);
    const maxFile = Math.max(...med.map((i) => i.file.length));
    const colW = Math.min(maxFile + 2, 48);
    nl();
    for (const issue of med) {
      console.log(`${I}${icon(issue.severity)}  ${padEnd(chalk.white(issue.file), colW)} ${sectionMetrics(issue)}`);
    }
  }
}

// ── Duplicates ──────────────────────────────────────────────────────

function printDuplicates(issues: DuplicateSnippetIssue[]): void {
  if (issues.length === 0) return;
  sectionTitle('Duplicate Snippets', issues.length);

  nl();
  for (const issue of issues) {
    console.log(`${I}${icon(issue.severity)}  ${chalk.white('Identical content')}  ${chalk.dim('— consolidate into a single snippet')}`);
    for (const s of issue.snippets) {
      console.log(`${D}${chalk.dim(s)}`);
    }
  }
}

// ── Summary ─────────────────────────────────────────────────────────

function printSummary(report: ThemeGuardianReport): void {
  const { summary } = report;

  nl();
  console.log(P + rule());

  if (summary.totalIssues === 0) {
    nl();
    console.log(`${P}${chalk.green.bold('✓  No issues found — your theme looks great!')}`);
    nl();
    console.log(P + rule());
    nl();
    return;
  }

  nl();
  console.log(`${P}${chalk.bold(plural(summary.totalIssues, 'issue') + ' found')}`);
  nl();

  const parts: string[] = [];
  if (summary.high > 0) parts.push(`${chalk.red('✖')}  ${chalk.red.bold(String(summary.high))} ${chalk.red('high')}`);
  if (summary.medium > 0) parts.push(`${chalk.yellow('▲')}  ${chalk.yellow.bold(String(summary.medium))} ${chalk.yellow('medium')}`);
  if (summary.low > 0) parts.push(`${chalk.blue('●')}  ${chalk.blue.bold(String(summary.low))} ${chalk.blue('low')}`);
  console.log(`${P}${parts.join('    ')}`);

  nl();
  console.log(P + rule());
  nl();
}

// ── Header ──────────────────────────────────────────────────────────

function printHeader(report: ThemeGuardianReport): void {
  const { meta } = report;
  const parts: string[] = [];
  if (meta.sections > 0) parts.push(plural(meta.sections, 'section'));
  if (meta.snippets > 0) parts.push(plural(meta.snippets, 'snippet'));
  if (meta.templates > 0) parts.push(plural(meta.templates, 'template'));

  nl();
  console.log(`${P}${chalk.bold('theme-guardian')} ${chalk.dim('v0.1.0')}`);
  if (parts.length > 0) {
    console.log(`${P}${chalk.dim(parts.join(' · ') + ' scanned')}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

export function printReport(report: ThemeGuardianReport): void {
  printHeader(report);
  printLoops(report.issues.loops);
  printSnippets(report.issues.snippets);
  printSections(report.issues.sections);
  printDuplicates(report.issues.duplicates);
  printSummary(report);
}
