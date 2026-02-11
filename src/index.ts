#!/usr/bin/env node
import { createProgram } from './cli/index.js';

const program = createProgram();

// npm/pnpm/yarn insert a bare '--' between the script and forwarded args
// (e.g. `pnpm dev -- analyze path --json` → `tsx index.ts -- analyze path --json`).
// Commander treats '--' as "stop parsing options", which prevents subcommand
// flags like --json and --fail-on from being recognized. Strip it.
const argv = [...process.argv];
if (argv[2] === '--') {
  argv.splice(2, 1);
}

program.parse(argv);
