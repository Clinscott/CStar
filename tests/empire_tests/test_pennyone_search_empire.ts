import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { searchMatrix } from  '../../src/tools/pennyone/live/search.js';
import {
    closeDb,
    getHallRepositoryRecord,
    recordHallFile,
    recordHallScan,
    saveHallDocumentSnapshot,
    saveHallPlanningSession,
    saveHallSkillProposal,
    saveHallMountedSpoke,
    upsertHallBead,
    updateFtsIndex,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.ts';
import { registry } from  '../../src/tools/pennyone/pathRegistry.js';
import { createGungnirMatrix } from  '../../src/types/gungnir.js';
import { buildHallRepositoryId } from  '../../src/types/hall.js';

describe('PennyOne Unified Search (Phase 5)', () => {
    const originalRoot = registry.getRoot();
    let tmpRoot: string;

    beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-p1-search-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        fs.writeFileSync(
            path.join(tmpRoot, '.agents', 'sovereign_state.json'),
            JSON.stringify({ framework: { status: 'AWAKE', active_persona: 'ALFRED' } }, null, 2),
            'utf-8',
        );
        registry.setRoot(tmpRoot);
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    test('searchMatrix identifies files by intent from Hall-backed projection state', async () => {
        const mountedRoot = path.join(tmpRoot, 'KeepOS');
        const mountedRepoId = buildHallRepositoryId(mountedRoot.replace(/\\/g, '/'));
        const filePath = path.join(mountedRoot, 'src', 'intent.ts');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.7,
            intent_integrity: 92,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        const brainRecord = getHallRepositoryRecord(tmpRoot);
        assert.ok(brainRecord);
        saveHallMountedSpoke({
            spoke_id: 'spoke:keepos',
            repo_id: brainRecord!.repo_id,
            slug: 'keepos',
            kind: 'git',
            root_path: mountedRoot,
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_only',
            projection_status: 'current',
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: mountedRoot,
            name: 'KeepOS',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.7,
            intent_integrity: 92,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-search-1',
            repo_id: mountedRepoId,
            scan_kind: 'search_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.7,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: mountedRepoId,
            scan_id: 'scan-search-1',
            path: filePath,
            content_hash: 'intent123',
            language: 'ts',
            matrix: createGungnirMatrix({ overall: 7.7, sovereignty: 0.82 }),
            intent_summary: 'Gateway intent sector for Phase 5 search',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix('gateway', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        assert.match(output, /spoke:\/\/keepos\/src\/intent\.ts/i);
        assert.match(output, /Gateway intent sector/i);
    });

    test('searchMatrix handles unknown queries gracefully', async () => {
        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix('NON_EXISTENT_SECTOR_TOKEN_XYZ', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        assert.match(output, /No matches found in the Hall of Records/i);
    });

    test('searchMatrix remains accessible for hyphenated bead-style queries', async () => {
        const repoId = buildHallRepositoryId(tmpRoot.replace(/\\/g, '/'));
        const filePath = path.join(tmpRoot, 'XO', 'docs', 'foundation', 'XO_CHARTER.md');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        recordHallScan({
            scan_id: 'scan-search-hyphen',
            repo_id: repoId,
            scan_kind: 'search_test',
            status: 'COMPLETED',
            baseline_gungnir_score: 7.4,
            started_at: 1700000000000,
            completed_at: 1700000000100,
            metadata: { source: 'unit-test' },
        });
        recordHallFile({
            repo_id: repoId,
            scan_id: 'scan-search-hyphen',
            path: filePath,
            content_hash: 'hyphen123',
            language: 'md',
            matrix: createGungnirMatrix({ overall: 7.4, sovereignty: 0.8 }),
            intent_summary: 'XO bead charter scope non-goals operating modes foundation',
            interaction_summary: 'Standard',
            created_at: 1700000000200,
        });
        updateFtsIndex(filePath, 'XO bead charter scope non-goals operating modes foundation', 'Open scope matrix');

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix('pb-xo-foundation xo-bead-01 charter scope non-goals operating modes', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        assert.doesNotMatch(output, /Hall of Records currently inaccessible/i);
        assert.match(output, /XO_CHARTER\.md/i);
    });

    test('searchMatrix surfaces planning sessions and beads for known Hall repositories', async () => {
        const xoRoot = path.join(tmpRoot, 'XO');
        const xoRepoId = buildHallRepositoryId(xoRoot.replace(/\\/g, '/'));
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallPlanningSession({
            session_id: 'chant-session:xo-phase1-runtime',
            repo_id: xoRepoId,
            skill_id: 'chant',
            status: 'PLAN_READY',
            user_intent: 'Convert the XO implementation plan into bounded CStar development beads.',
            normalized_intent: 'Plan XO phase one implementation beads.',
            summary: 'XO Phase 1 runtime plan',
            current_bead_id: 'xo-phase1-schema-store',
            created_at: 1700000000100,
            updated_at: 1700000000100,
            metadata: {},
        });
        upsertHallBead({
            bead_id: 'xo-phase1-schema-store',
            repo_id: xoRepoId,
            target_kind: 'SECTOR',
            target_ref: 'chant-session:xo-phase1-runtime',
            target_path: 'src/domain',
            rationale: 'Canonical schema and storage substrate',
            contract_refs: ['docs/planning/XO_IMPLEMENTATION_PLAN.md'],
            baseline_scores: {},
            acceptance_criteria: 'Canonical XO records can be created and validated without UI.',
            status: 'OPEN',
            source_kind: 'CHANT',
            created_at: 1700000000200,
            updated_at: 1700000000200,
        });
        saveHallSkillProposal({
            proposal_id: 'proposal:chant-session:xo-phase1-runtime:xo-phase1-schema-store',
            repo_id: xoRepoId,
            skill_id: 'chant',
            bead_id: 'xo-phase1-schema-store',
            target_path: 'src/domain',
            proposal_path: path.join(xoRoot, '.agents', 'proposals', 'xo-phase1-schema-store.json'),
            status: 'PROPOSED',
            summary: 'Canonical schema and storage substrate',
            created_at: 1700000000300,
            updated_at: 1700000000300,
            metadata: {},
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix('chant-session:xo-phase1-runtime xo-phase1-schema-store', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        assert.match(output, /PLAN/i);
        assert.match(output, /chant-session:xo-phase1-runtime/i);
        assert.match(output, /BEAD/i);
        assert.match(output, /xo-phase1-schema-store/i);
        assert.match(output, /src\/domain/i);
    });

    test('searchMatrix surfaces Hall-backed doctrine documents', async () => {
        const xoRoot = path.join(tmpRoot, 'XO');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/foundation/XO_MEMORY_MODEL.md',
            content: '# XO Memory Model\n\nDurable memory for long-horizon educational adaptation.\n',
            doc_kind: 'foundation',
            created_at: 1700000000500,
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix('long-horizon educational adaptation', tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        assert.match(output, /DOC/i);
        assert.match(output, /XO_MEMORY_MODEL\.md/i);
        assert.match(output, /XO Memory Model/i);
    });

    test('searchMatrix demotes archived FTS doctrine behind live runtime authority documents', async () => {
        const probe = 'rankprobe-fts-doc-chant-authority';
        const xoRoot = path.join(tmpRoot, 'XO');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/legacy_archive/ARCHITECT_PLAN.md',
            content: `# Archived Architect Plan\n\nArchitect owns proposal synthesis ${probe}.\n`,
            doc_kind: 'legacy',
            created_at: 1700000000600,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'src/node/core/runtime/host_workflows/chant_planner.ts',
            content: `// Live chant planner authority ${probe}\n`,
            doc_kind: 'runtime',
            created_at: 1700000000601,
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix(probe, tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        const liveIndex = output.indexOf('chant_planner.ts');
        const archivedIndex = output.indexOf('ARCHITECT_PLAN.md');

        assert.notStrictEqual(liveIndex, -1);
        assert.notStrictEqual(archivedIndex, -1);
        assert.ok(liveIndex < archivedIndex, 'Live runtime authority document should rank ahead of archived doctrine');
    });

    test('searchMatrix boosts fresh maintenance artifacts for maintenance-oriented queries', async () => {
        const probe = 'rankprobe-maintenance-hygiene-normalize';
        const xoRoot = path.join(tmpRoot, 'XO');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/foundation/HALL_MAINTENANCE_GUIDE.md',
            content: `# Hall Maintenance Guide\n\nNormalize hygiene report doctrine ${probe}.\n`,
            doc_kind: 'doctrine',
            created_at: 1700000000600,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/reports/hall/hygiene-reports/1700000000601.json',
            content: JSON.stringify({
                summary: `Fresh hall hygiene report ${probe}`,
                receipt_state: 'fresh',
            }, null, 2),
            doc_kind: 'maintenance',
            title: 'PennyOne Hall Hygiene Report',
            summary: `Fresh hall hygiene report ${probe}`,
            metadata: {
                report_kind: 'pennyone-hall-hygiene',
                source: 'pennyone-report',
                archived: false,
                authority_tier: 'reference',
            },
            created_at: Date.now(),
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix(`maintenance hygiene report normalize ${probe}`, tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        const maintenanceIndex = output.indexOf('hygiene-reports/1700000000601.json');
        const doctrineIndex = output.indexOf('HALL_MAINTENANCE_GUIDE.md');

        assert.notStrictEqual(maintenanceIndex, -1);
        assert.notStrictEqual(doctrineIndex, -1);
        assert.ok(maintenanceIndex < doctrineIndex, 'Fresh maintenance artifact should rank ahead of generic doctrine for maintenance queries');
    });

    test('searchMatrix surfaces maintenance receipts ahead of doctrine for short artifact probes', async () => {
        const probe = 'mx';
        const xoRoot = path.join(tmpRoot, 'XO');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/foundation/HALL_HEURISTIC_GUIDE.md',
            content: '# Hall Heuristic Guide\n\nmx maintenance doctrine baseline.\n',
            doc_kind: 'doctrine',
            created_at: 1700000000600,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/reports/hall/normalize-receipts/1700000000602.json',
            content: JSON.stringify({
                summary: 'mx normalize receipt',
                receipt_state: 'fresh',
            }, null, 2),
            doc_kind: 'maintenance',
            title: 'PennyOne Normalize Receipt',
            summary: 'mx normalize receipt',
            metadata: {
                receipt_kind: 'pennyone-normalize',
                source: 'pennyone-normalize',
                archived: false,
                authority_tier: 'reference',
            },
            created_at: Date.now(),
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix(probe, tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        const maintenanceIndex = output.indexOf('normalize-receipts/1700000000602.json');
        const doctrineIndex = output.indexOf('HALL_HEURISTIC_GUIDE.md');

        assert.notStrictEqual(maintenanceIndex, -1);
        assert.notStrictEqual(doctrineIndex, -1);
        assert.ok(maintenanceIndex < doctrineIndex, 'Maintenance receipt should rank ahead of generic doctrine for short artifact probes');
    });

    test('searchMatrix boosts maintenance status snapshots ahead of component maintenance artifacts', async () => {
        const probe = 'rankprobe-maintenance-status-view';
        const xoRoot = path.join(tmpRoot, 'XO');
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000000,
            updated_at: 1700000000000,
        });
        upsertHallRepository({
            root_path: xoRoot,
            name: 'XO',
            status: 'AWAKE',
            active_persona: 'ALFRED',
            baseline_gungnir_score: 7.4,
            intent_integrity: 90,
            created_at: 1700000000001,
            updated_at: 1700000000001,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/reports/hall/normalize-receipts/1700000000603.json',
            content: JSON.stringify({ summary: `Normalize receipt ${probe}` }, null, 2),
            doc_kind: 'maintenance',
            title: 'PennyOne Normalize Receipt',
            summary: `Normalize receipt ${probe}`,
            metadata: {
                receipt_kind: 'pennyone-normalize',
                source: 'pennyone-normalize',
                archived: false,
                authority_tier: 'reference',
            },
            created_at: 1700000000603,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/reports/hall/hygiene-reports/1700000000604.json',
            content: JSON.stringify({ summary: `Hygiene report ${probe}` }, null, 2),
            doc_kind: 'maintenance',
            title: 'PennyOne Hall Hygiene Report',
            summary: `Hygiene report ${probe}`,
            metadata: {
                report_kind: 'pennyone-hall-hygiene',
                source: 'pennyone-report',
                archived: false,
                authority_tier: 'reference',
            },
            created_at: 1700000000604,
        });
        saveHallDocumentSnapshot({
            root_path: xoRoot,
            document_path: 'docs/reports/hall/status-reports/1700000000605.json',
            content: JSON.stringify({ summary: `Maintenance status ${probe}` }, null, 2),
            doc_kind: 'maintenance',
            title: 'PennyOne Hall Maintenance Status',
            summary: `Maintenance status ${probe}`,
            metadata: {
                status_kind: 'pennyone-maintenance-status',
                source: 'pennyone-status',
                archived: false,
                authority_tier: 'reference',
            },
            created_at: 1700000000605,
        });

        let output = '';
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string | Uint8Array) => {
            output += chunk.toString();
            return true;
        }) as typeof process.stdout.write;

        try {
            await searchMatrix(`maintenance ${probe}`, tmpRoot);
        } finally {
            process.stdout.write = originalWrite;
        }

        const statusIndex = output.indexOf('status-reports/1700000000605.json');
        const reportIndex = output.indexOf('hygiene-reports/1700000000604.json');
        const receiptIndex = output.indexOf('normalize-receipts/1700000000603.json');

        assert.notStrictEqual(statusIndex, -1);
        assert.notStrictEqual(reportIndex, -1);
        assert.notStrictEqual(receiptIndex, -1);
        assert.ok(statusIndex < reportIndex, 'Maintenance status should rank ahead of hygiene report for status queries');
        assert.ok(reportIndex < receiptIndex, 'Hygiene report should rank ahead of normalize receipt for status queries');
    });
});
