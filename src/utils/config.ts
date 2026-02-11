import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import type { Severity } from '../types/report.js';

export interface ThemeGuardianConfig {
  maxSnippetDepth: number;
  maxSectionLines: number;
  maxSectionBlocks: number;
  /** Only set when explicitly requested via config file or CLI flag. */
  failOn?: Severity;
}

const DEFAULTS: ThemeGuardianConfig = {
  maxSnippetDepth: 3,
  maxSectionLines: 400,
  maxSectionBlocks: 10,
  // failOn intentionally omitted -- exit code 1 is opt-in
};

const VALID_SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH'];

function isValidSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && VALID_SEVERITIES.includes(value as Severity);
}

function loadConfigFile(themePath: string): Partial<ThemeGuardianConfig> {
  const configPath = join(resolve(themePath), 'theme-guardian.config.json');
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Partial<ThemeGuardianConfig> = {};

    if (typeof parsed.maxSnippetDepth === 'number' && parsed.maxSnippetDepth >= 0) {
      result.maxSnippetDepth = parsed.maxSnippetDepth;
    }
    if (typeof parsed.maxSectionLines === 'number' && parsed.maxSectionLines >= 0) {
      result.maxSectionLines = parsed.maxSectionLines;
    }
    if (typeof parsed.maxSectionBlocks === 'number' && parsed.maxSectionBlocks >= 0) {
      result.maxSectionBlocks = parsed.maxSectionBlocks;
    }
    if (isValidSeverity(parsed.failOn)) {
      result.failOn = parsed.failOn;
    }

    return result;
  } catch {
    return {};
  }
}

export interface CLIOverrides {
  failOn?: Severity;
}

export function resolveConfig(
  themePath: string,
  cliOverrides: CLIOverrides = {},
): ThemeGuardianConfig {
  const fileConfig = loadConfigFile(themePath);

  return {
    ...DEFAULTS,
    ...fileConfig,
    ...(cliOverrides.failOn ? { failOn: cliOverrides.failOn } : {}),
  };
}
