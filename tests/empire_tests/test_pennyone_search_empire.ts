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
});
