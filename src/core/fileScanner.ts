import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative, join, posix } from 'node:path';
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
      lines: content.split('\n').length - (content.endsWith('\n') ? 1 : 0),
    };
  });
}

/**
 * Resolve the effective theme root. If `sections/` doesn't exist at the given
 * path but `src/sections/` does (common in dev setups with build tools), use
 * the `src/` subdirectory instead.
 */
function resolveThemeRoot(themePath: string): string {
  const abs = resolve(themePath);
  if (existsSync(join(abs, 'sections'))) return abs;
  const srcPath = join(abs, 'src');
  if (existsSync(join(srcPath, 'sections'))) {
    console.log(`  Auto-detected theme root: ${srcPath}`);
    return srcPath;
  }
  return abs;
}

export function scanThemeFiles(themePath: string): ThemeFiles {
  const root = resolveThemeRoot(themePath);
  return {
    sections: scanPattern(root, 'sections/**/*.liquid'),
    snippets: scanPattern(root, 'snippets/**/*.liquid'),
    templates: scanPattern(root, 'templates/**/*.liquid'),
  };
}
