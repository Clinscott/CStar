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
    saveHallMountedSpoke,
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
});
