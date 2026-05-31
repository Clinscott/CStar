#!/usr/bin/env node
//
// Live integration smoke check for the host-side sync worker.
// Mirrors cstar-console's scripts/mongo_smoke.mjs: it connects to the live
// Atlas cluster, round-trips ONE synthetic intent through a STUBBED pipeline
// CLI (so it never touches pennyone.db), confirms the intent flips to
// `applied`, and confirms a mirror upsert + read-back. It then cleans up.
//
// Env-guarded: a no-op (exit 0) when CSTAR_MONGO_URI is unset.
// Prints booleans / ids only — NEVER the connection string.
//
// Usage: node scripts/mongo_smoke.mjs
//
// This file is a thin launcher: it re-execs Node with the local tsx loader so
// the TypeScript worker can be imported directly from source (no build step).

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const tsxLoader = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');
const impl = path.join(__dirname, 'mongo_smoke.impl.ts');

if (!fs.existsSync(tsxLoader)) {
    console.error('tsx loader not found. Run npm install.');
    process.exit(1);
}

const result = spawnSync(process.execPath, ['--import', tsxLoader, impl, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: projectRoot,
    env: process.env,
});

process.exit(result.status ?? 1);
