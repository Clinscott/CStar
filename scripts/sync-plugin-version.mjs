#!/usr/bin/env node
// Propagates package.json "version" into .claude-plugin/plugin.json.
// Invoked by the npm "version" lifecycle so `npm version <bump>` keeps both files aligned in one commit.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'package.json');
const PLUGIN = join(ROOT, '.claude-plugin', 'plugin.json');

const pkg = JSON.parse(readFileSync(PKG, 'utf8'));
const plugin = JSON.parse(readFileSync(PLUGIN, 'utf8'));

if (plugin.version === pkg.version) {
    process.exit(0);
}

plugin.version = pkg.version;
writeFileSync(PLUGIN, JSON.stringify(plugin, null, 2) + '\n');
console.log(`[sync-plugin-version] plugin.json -> ${pkg.version}`);
