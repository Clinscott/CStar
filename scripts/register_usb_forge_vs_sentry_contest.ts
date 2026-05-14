#!/usr/bin/env tsx
/**
 * BEAD-CSTAR-WAR-GAME-SCORING-001 — K7
 *
 * Register the first war-game contest: USB Forge vs USB Sentry — v1 (Mode A).
 * Idempotent; safe to run multiple times. Updates the contest's class/compatibility
 * maps if they have evolved.
 *
 * Usage:
 *   node scripts/run-tsx.mjs scripts/register_usb_forge_vs_sentry_contest.ts
 */

import { database } from '../src/tools/pennyone/intel/database.js';
import { registerContest } from '../src/tools/war_game/score_trigger.js';
import { ensureHallSchema } from '../src/tools/pennyone/intel/schema.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CONTEST_CONFIG = {
    contest_id: 'usb-forge-vs-sentry-v1',
    contest_name: 'USB Forge vs USB Sentry — v1 (Mode A)',
    attacker_label: 'claude:forge',
    defender_label: 'codex:sentry',
    attacker_bead_id: 'BEAD-USB-FORGE-001',
    defender_bead_id: 'BEAD-USB-SENTRY-FORGE-LISTENER-001',
    attacker_intent_prefix: 'usb-forge/shot-fired/',
    defender_intent_prefix: 'usb-sentry/verdict/',
    shot_id_path: 'metadata.shot_id',
    expected_path: 'metadata.expected',
    terminal_event_path: 'metadata.terminal_event',
    terminal_event_class_map: {
        block: [
            'usb-sentry/phase1-hit',
            'usb-sentry/device-held-rejected',
            'usb-sentry/forge-listener-refused',
        ],
        complete: ['usb-sentry/complete'],
        inconclusive: [
            'usb-sentry/forge-listener-timeout',
            'usb-sentry/forge-listener-panic',
        ],
    },
    scenario_compatibility_map: {
        // §Q4 — structurally-valid terminal_events per scenario.
        // See docs/beads/cstar-war-game-scoring-001.md for derivation.
        'FORGE-MS-001': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],         // baseline clean (or false-positive)
        'FORGE-MS-002': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],         // EICAR straddle; complete = bypass
        'FORGE-MS-003': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],         // multi-rule YARA
        'FORGE-MS-004': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],         // oversized LUN; capture finishes
        'FORGE-MS-005': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],         // native 4K sectors
        'FORGE-FS-001': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],         // malformed FAT — parser outcome
        'FORGE-SCSI-001': ['usb-sentry/complete', 'usb-sentry/phase1-hit'],       // recoverable errors retry
        'FORGE-SCSI-002': ['usb-sentry/phase1-hit', 'usb-sentry/complete'],       // unrecoverable medium error
        'FORGE-HID-001': ['usb-sentry/device-held-rejected'],                      // pure HID — never reaches Phase 1
        'FORGE-HID-002': ['usb-sentry/device-held-rejected', 'usb-sentry/phase1-hit'], // composite — held or scanned
        'FORGE-UAS-001': ['usb-sentry/device-held-rejected'],                      // UAS refusal
    },
    metadata: {
        registered_by: 'scripts/register_usb_forge_vs_sentry_contest.ts',
        design_doc: 'docs/beads/cstar-war-game-scoring-001.md',
        notes: 'v1 ships with mode (a) only — seeded FakeBulkOnlyTransport on the SecureSphere listener side.',
    },
};

function main(): void {
    // Force schema migration for the active database before insert.
    const root = process.env.CSTAR_CONTROL_ROOT || PROJECT_ROOT;
    const db = database.getDb();
    ensureHallSchema(db, root);

    // Find the kernel's own repo_id (the contest is anchored to it).
    const row = db
        .prepare(`SELECT repo_id FROM hall_repositories ORDER BY created_at ASC LIMIT 1`)
        .get() as { repo_id: string } | undefined;
    if (!row) {
        console.error('[register-contest] No hall_repositories rows found. Run ensureHallSchema first.');
        process.exit(1);
    }

    registerContest(db, { ...CONTEST_CONFIG, repo_id: row.repo_id });

    console.log(`[register-contest] Registered contest '${CONTEST_CONFIG.contest_id}'`);
    console.log(`                   ${CONTEST_CONFIG.attacker_label} vs ${CONTEST_CONFIG.defender_label}`);
    console.log(`                   attacker prefix: ${CONTEST_CONFIG.attacker_intent_prefix}`);
    console.log(`                   defender prefix: ${CONTEST_CONFIG.defender_intent_prefix}`);
    console.log(`                   ${Object.keys(CONTEST_CONFIG.scenario_compatibility_map).length} scenarios in compatibility map`);
}

main();
