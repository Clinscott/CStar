#!/usr/bin/env node
// Emits a <=400-char Corvus Star profile digest for injection into SessionStart context.
// Identity resolution order:
//   1. CORVUS_STAR_ACTIVE_EMAIL env var (preferred — set by user shell rc per machine).
//   2. Most-recently-updated cs_profiles row (single-user fallback).
// If no profile exists, exits silently so the hook adds no noise to the session.

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = join(ROOT, '.stats', 'pennyone.db');

if (!existsSync(DB_PATH)) {
    process.exit(0);
}

let Database;
try {
    Database = (await import('better-sqlite3')).default;
} catch {
    process.exit(0);
}

const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

try {
    db.prepare('SELECT 1 FROM cs_profiles LIMIT 1').get();
} catch {
    process.exit(0);
}

const email = process.env.CORVUS_STAR_ACTIVE_EMAIL;
let profile = null;
if (email) {
    profile = db.prepare('SELECT * FROM cs_profiles WHERE email = ? ORDER BY updated_at DESC LIMIT 1').get(email);
}
if (!profile) {
    profile = db.prepare('SELECT * FROM cs_profiles ORDER BY updated_at DESC LIMIT 1').get();
}
if (!profile) {
    process.exit(0);
}

const services = db
    .prepare('SELECT service FROM cs_secret_refs WHERE oauth_provider = ? AND oauth_sub = ? ORDER BY service')
    .all(profile.oauth_provider, profile.oauth_sub)
    .map((r) => r.service);

let prefs = {};
try {
    prefs = JSON.parse(profile.preferences || '{}');
} catch {
    prefs = {};
}
const prefKeys = Object.keys(prefs).slice(0, 5);

const parts = [
    `user: ${profile.display_name || profile.email || profile.oauth_sub}`,
    `persona: ${profile.persona || 'ALFRED'}`,
    `services: ${services.length > 0 ? services.join(', ') : 'none'}`,
    `prefs: ${prefKeys.length > 0 ? prefKeys.join(', ') : 'none'}`,
];

const digest = ('[Corvus Star profile] ' + parts.join(' | ')).slice(0, 400);
process.stdout.write(digest + '\n');
