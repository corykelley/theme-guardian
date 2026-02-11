export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LoopIssue {
  file: string;
  depth: number;
  score: number;
  severity: Severity;
  message: string;
}

export interface SnippetGraphIssue {
  type: 'DEPTH_EXCEEDED' | 'CIRCULAR';
  chain: string[];
  severity: Severity;
}

export interface SectionIssue {
  file: string;
  lines: number;
  blocks: number;
  severity: Severity;
  message: string;
}

export interface DuplicateSnippetIssue {
  hash: string;
  snippets: string[];
  severity: 'LOW';
}

export interface ScanMeta {
  sections: number;
  snippets: number;
  templates: number;
}

export interface ThemeGuardianReport {
  meta: ScanMeta;
  summary: {
    totalIssues: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: {
    loops: LoopIssue[];
    snippets: SnippetGraphIssue[];
    sections: SectionIssue[];
    duplicates: DuplicateSnippetIssue[];
  };
}

export interface FileMeta {
  path: string;
  content: string;
  lines: number;
}

export interface ThemeFiles {
  sections: FileMeta[];
  snippets: FileMeta[];
  templates: FileMeta[];
}
