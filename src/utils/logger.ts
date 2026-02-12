import chalk from 'chalk';
import type {
  Severity,
  ThemePulseReport,
  LoopIssue,
  SnippetGraphIssue,
  SectionIssue,
  DuplicateSnippetIssue,
  CommentBlockIssue,
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

function lineRef(nums: number[]): string {
  if (nums.length === 0) return '';
  if (nums.length === 1) return ` at line ${nums[0]}`;
  return ` at lines ${nums.join(', ')}`;
}

export function loopHint(issue: LoopIssue): string {
  const { lineDetails } = issue;

  if (lineDetails.allProducts.length > 0) {
    return `Replace all_products${lineRef(lineDetails.allProducts)} with a specific collection — bypasses caching`;
  }
  if (issue.depth >= 2 && lineDetails.hoistableFilters.length > 0) {
    return `Nested loop${lineRef(lineDetails.nestedLoops)} — move static filters${lineRef(lineDetails.hoistableFilters)} to assign tags above the loop`;
  }
  if (issue.depth >= 2) {
    return `Nested loop${lineRef(lineDetails.nestedLoops)} — consider flattening or limiting the inner collection with limit:`;
  }
  if (lineDetails.hoistableFilters.length > 0) {
    return `Move static filters${lineRef(lineDetails.hoistableFilters)} to assign tags above the loop — they don't depend on the loop variable`;
  }
  return 'Consider limiting the collection size or paginating';
}

export function sectionHint(issue: SectionIssue): string {
  const bigLines = issue.lines > 600;
  const bigBlocks = issue.blocks > 20;

  if (bigLines && bigBlocks) {
    return 'Split into focused sections and extract repeated markup into snippets';
  }
  if (bigBlocks) {
    return 'Reduce schema blocks — group related options or split into multiple sections';
  }
  if (bigLines) {
    return 'Long file with heavy markup — extract reusable markup into snippets';
  }
  if (issue.lines > 400 && issue.blocks > 10) {
    return 'Many block types in a large file — consider splitting into multiple sections';
  }
  if (issue.lines > 400) {
    return 'Large file — extract repeated markup into snippets to reduce size';
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
  if (issue.lineDetails.nestedLoops.length > 0) {
    tags.push(`nested · L${issue.lineDetails.nestedLoops.join(',')}`);
  }
  if (issue.lineDetails.hoistableFilters.length > 0) {
    tags.push(`hoistable · L${issue.lineDetails.hoistableFilters.join(',')}`);
  }
  if (issue.lineDetails.allProducts.length > 0) {
    tags.push('all_products');
  }
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
  if (issue.blocks === 0) {
    return chalk.dim(`${issue.lines} lines · no schema blocks`);
  }
  return chalk.dim(`${issue.lines} lines · ${plural(issue.blocks, 'block')}`);
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

// ── Comment blocks ──────────────────────────────────────────────

export function commentBlockHint(issue: CommentBlockIssue): string {
  return `${issue.lineCount}-line comment block — audit and consider removing dead code`;
}

function printCommentBlocks(issues: CommentBlockIssue[]): void {
  if (issues.length === 0) return;
  sectionTitle('Large Comment Blocks', issues.length);

  severityHeader('MEDIUM', issues.length);
  const maxFile = Math.max(...issues.map((i) => i.file.length));
  const colW = Math.min(maxFile + 2, 48);
  nl();
  for (const issue of issues) {
    const meta = chalk.dim(`${issue.lineCount} lines at line ${issue.line}`);
    console.log(`${I}${icon(issue.severity)}  ${padEnd(chalk.white(issue.file), colW)} ${meta}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────

function printSummary(report: ThemePulseReport): void {
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

function printHeader(report: ThemePulseReport): void {
  const { meta } = report;
  const parts: string[] = [];
  if (meta.sections > 0) parts.push(plural(meta.sections, 'section'));
  if (meta.snippets > 0) parts.push(plural(meta.snippets, 'snippet'));
  if (meta.templates > 0) parts.push(plural(meta.templates, 'template'));

  nl();
  const s = chalk.cyan;
  const f = chalk.dim;
  console.log(`${P}       ${s('▄██████████████▄')}`);
  console.log(`${P}      ${s('██')}${f('░░░░░░░░░░░░░░')}${s('██')}`);
  console.log(`${P}      ${s('██')}${f('░░░░░░░░░░░░░░')}${s('██')}`);
  console.log(`${P}       ${s('██')}${f('░░░░░░░░░░░░')}${s('██')}`);
  console.log(`${P}        ${s('▀██')}${f('░░░░░░░░')}${s('██▀')}`);
  console.log(`${P}          ${s('▀██')}${f('░░░░')}${s('██▀')}`);
  console.log(`${P}            ${s('▀████▀')}`);
  nl();
  console.log(`${P}${chalk.bold('theme-pulse')} ${f('v0.1.0')}`);
  if (parts.length > 0) {
    console.log(`${P}${f(parts.join(' · ') + ' scanned')}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────

export function printReport(report: ThemePulseReport): void {
  printHeader(report);
  printLoops(report.issues.loops);
  printSnippets(report.issues.snippets);
  printSections(report.issues.sections);
  printDuplicates(report.issues.duplicates);
  printCommentBlocks(report.issues.commentBlocks);
  printSummary(report);
}
