import type {
  Severity,
  ScanMeta,
  LoopIssue,
  SnippetGraphIssue,
  SectionIssue,
  DuplicateSnippetIssue,
  CommentBlockIssue,
  ThemePulseReport,
} from '../types/report.js';

const SEVERITY_RANK: Record<Severity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

export function shouldFail(
  failOn: Severity,
  report: ThemePulseReport,
): boolean {
  const threshold = severityRank(failOn);
  const allSeverities: Severity[] = [
    ...report.issues.loops.map((i) => i.severity),
    ...report.issues.snippets.map((i) => i.severity),
    ...report.issues.sections.map((i) => i.severity),
    ...report.issues.duplicates.map((i) => i.severity),
    ...report.issues.commentBlocks.map((i) => i.severity),
  ];
  return allSeverities.some((s) => severityRank(s) >= threshold);
}

export function buildReport(
  issues: {
    loops: LoopIssue[];
    snippets: SnippetGraphIssue[];
    sections: SectionIssue[];
    duplicates: DuplicateSnippetIssue[];
    commentBlocks: CommentBlockIssue[];
  },
  meta: ScanMeta = { sections: 0, snippets: 0, templates: 0 },
): ThemePulseReport {
  let high = 0;
  let medium = 0;
  let low = 0;

  const countSeverity = (severity: Severity) => {
    switch (severity) {
      case 'HIGH':
        high++;
        break;
      case 'MEDIUM':
        medium++;
        break;
      case 'LOW':
        low++;
        break;
    }
  };

  issues.loops.forEach((i) => countSeverity(i.severity));
  issues.snippets.forEach((i) => countSeverity(i.severity));
  issues.sections.forEach((i) => countSeverity(i.severity));
  issues.duplicates.forEach((i) => countSeverity(i.severity));
  issues.commentBlocks.forEach((i) => countSeverity(i.severity));

  return {
    meta,
    summary: {
      totalIssues: high + medium + low,
      high,
      medium,
      low,
    },
    issues,
  };
}
