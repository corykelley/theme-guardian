import { readFileSync } from 'node:fs';
import { resolve, relative, posix } from 'node:path';
import { globSync } from 'glob';
import type { FileMeta, ThemeFiles } from '../types/report.js';

function scanPattern(themePath: string, pattern: string): FileMeta[] {
  const absTheme = resolve(themePath);
  const matches = globSync(pattern, { cwd: absTheme, absolute: true });

  return matches.map((absPath) => {
    const content = readFileSync(absPath, 'utf-8');
    // Store path relative to theme root using posix separators for consistency
    const relPath = relative(absTheme, absPath).split('\\').join(posix.sep);
    return {
      path: relPath,
      content,
      lines: content.split('\n').length,
    };
  });
}

export function scanThemeFiles(themePath: string): ThemeFiles {
  return {
    sections: scanPattern(themePath, 'sections/**/*.liquid'),
    snippets: scanPattern(themePath, 'snippets/**/*.liquid'),
    templates: scanPattern(themePath, 'templates/**/*.liquid'),
  };
}
