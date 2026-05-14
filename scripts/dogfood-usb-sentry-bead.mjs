#!/usr/bin/env node
//
// One-shot dogfood of cstar_spoke_bead_import.
// Registers BEAD-USB-SENTRY-001 against the live PennyOne DB via the new
// spoke-anchored handler. Same code path the MCP tool exposes, just bypasses
// the stdio transport so we can run it before the host reloads the MCP server.
//
// Usage: node scripts/dogfood-usb-sentry-bead.mjs

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const tsxLoader = path.join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs');

const inlineScript = `
import { handleSpokeBeadImport } from '${path.join(projectRoot, 'src/tools/cstar-kernel-mcp.ts').replace(/'/g, "\\'")}';

const augury = [
    '◈ ━━━━━ [ Ω ] CORVUS STAR AUGURY ━━━━━━━━━━━━━━━━━━━━━━ ◈',
    '│ Route: HARDEN → WEAVE: contract_hardening',
    '│ Intent: Sheep-dip USB capture station with hard isolation, SCSI-over-libusb, two-phase capture.',
    '│ Mimir\\'s Well: docs/design/USB_SENTRY.md | wireframe.md | tests/features/usb_sentry.feature',
    '│ Council Expert: hamilton (forensic correctness) — second chair: carmack (USB authorization framework)',
    '│ Verdict: Gungnir — execution-ready after Rev 2 corrections.',
    '◈ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◈',
].join('\\n');

const threatModel = [
    'In scope: mass-storage payloads, filesystem-parser exploits, BadUSB descriptor firewall.',
    'Out of scope (v1): UAS-only devices, USB Power Delivery / voltage attacks, firmware-resident persistence, tampered USB hubs.',
].join(' ');

const result = await handleSpokeBeadImport({
    spoke: 'securesphere',
    bead_id: 'bead:usb-sentry:001',
    intent: 'USB Sentry — Sheep-Dip capture and triage. Hold every inserted USB device at authorized=0, triage in volatile tmpfs ring buffer with sliding-window YARA/ClamAV, then forensically preserve to AFF4-L only on a clean Phase 1.',
    acceptance_criteria: 'All scenarios in tests/features/usb_sentry.feature pass; Phase 1 never touches host SSD; Phase 2 produces AFF4-L with matching SHA-256 + Blake3 to Phase 1 running hashes; udev rule holds devices at authorized=0; usb-storage and uas modules blacklisted at install time; UAS-only devices rejected with operator message; HID interfaces blocked by descriptor firewall.',
    lore_path: 'tests/features/usb_sentry.feature',
    design_doc_path: 'docs/design/USB_SENTRY.md',
    wireframe_ref: 'wireframe.md#usb-sentry-feature-pane',
    threat_model_summary: threatModel,
    augury_block: augury,
    contract_refs: [
        'file:src-tauri/src/services/usb_sentry/',
        'file:src/features/usb_sentry/',
    ],
    target_paths: [
        'src-tauri/src/services/usb_sentry/',
        'src/features/usb_sentry/',
        'docs/design/USB_SENTRY.md',
    ],
    target_kind: 'SPOKE',
    checker_shell: 'cargo test --package app -- usb_sentry',
    assigned_agent: 'unassigned',
    status: 'OPEN',
    metadata: {
        rev: 'R2',
        capture_protocol: 'USB-BBB SCSI-over-libusb',
        capture_phases: ['sliding-window-triage', 'aff4l-preservation'],
        analysis_stack: ['yara-x', 'clamav-rs'],
        deep_dive_handoff: 'REMnux via AFF4-L',
        v2_milestones: ['UAS support'],
    },
});

const parsed = JSON.parse(result.content[0].text);
if (result.isError) {
    console.error('DOGFOOD FAILED:', parsed.error);
    process.exit(1);
}
console.log(JSON.stringify(parsed, null, 2));
`;

const child = spawnSync(
    process.execPath,
    ['--import', tsxLoader, '--input-type=module', '-e', inlineScript],
    { cwd: projectRoot, stdio: 'inherit' },
);
process.exit(child.status ?? 1);
