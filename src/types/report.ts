export type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LoopLineDetails {
  /** 1-indexed line numbers where for-loops open */
  forLoops: number[];
  /** 1-indexed line numbers of for-loops at depth >= 2 */
  nestedLoops: number[];
  /** 1-indexed line numbers of filters that can be moved above the loop */
  hoistableFilters: number[];
  /** 1-indexed line numbers where all_products is referenced inside loops */
  allProducts: number[];
}

export interface LoopIssue {
  file: string;
  depth: number;
  score: number;
  severity: Severity;
  message: string;
  lineDetails: LoopLineDetails;
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

export interface CommentBlockIssue {
  file: string;
  line: number;
  lineCount: number;
  severity: 'MEDIUM';
}

export interface ScanMeta {
  sections: number;
  snippets: number;
  templates: number;
}

export interface ThemePulseReport {
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
    commentBlocks: CommentBlockIssue[];
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
