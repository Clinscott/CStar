import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { RuntimeContext, WeaveInvocation } from '../../../../src/node/core/runtime/contracts.ts';
import { EngraveWeave } from '../../../../src/node/core/runtime/weaves/engrave.js';
import {
    closeDb,
    getDb,
    getHallBead,
    listHallEpisodicMemory,
    upsertHallRepository,
} from '../../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../../src/tools/pennyone/pathRegistry.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../../src/types/hall.js';

function createContext(workspaceRoot: string): RuntimeContext {
    return {
        mission_id: 'MISSION-ENGRAVE',
        bead_id: 'BEAD-ENGRAVE',
        trace_id: 'TRACE-ENGRAVE',
        persona: 'O.D.I.N.',
        workspace_root: workspaceRoot,
        operator_mode: 'cli',
        target_domain: 'brain',
        interactive: true,
        env: {},
        timestamp: Date.now(),
    };
}

function writeSessionFile(memoryDir: string, fileName: string, events: unknown[]): string {
    const filePath = path.join(memoryDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2));
    return filePath;
}

describe('Engrave weave', () => {
    let tmpRoot: string;
    let originalRoot: string;
    let repoId: string;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-engrave-'));
        fs.mkdirSync(path.join(tmpRoot, '.agents'), { recursive: true });
        registry.setRoot(tmpRoot);
        closeDb();
        getDb(tmpRoot);
        upsertHallRepository({
            root_path: tmpRoot,
            name: path.basename(tmpRoot),
            status: 'AWAKE',
            active_persona: 'ODIN',
            baseline_gungnir_score: 88,
            intent_integrity: 92,
            metadata: { source: 'unit-test' },
            created_at: Date.now(),
            updated_at: Date.now(),
        });
        repoId = buildHallRepositoryId(normalizeHallPath(tmpRoot));
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it('fails fast when the memory directory is missing', async () => {
        fs.rmSync(path.join(tmpRoot, '.agents', 'memory'), { recursive: true, force: true });

        const weave = new EngraveWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:engrave',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as WeaveInvocation<any>,
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /Memory directory not found/i);
    });

    it('fails loud on malformed JSON and leaves the session file in place', async () => {
        const memoryDir = path.join(tmpRoot, '.agents', 'memory');
        fs.mkdirSync(memoryDir, { recursive: true });
        fs.writeFileSync(path.join(memoryDir, 'session_malformed.json'), '{"oops": [}');

        const weave = new EngraveWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:engrave',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as WeaveInvocation<any>,
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /MALFORMED_JSON/i);
        assert.ok(fs.existsSync(path.join(memoryDir, 'session_malformed.json')));
        assert.ok(!fs.existsSync(path.join(memoryDir, 'archive', 'session_malformed.json')));
    });

    it('fails loud on invalid schema and leaves the session file in place', async () => {
        const memoryDir = path.join(tmpRoot, '.agents', 'memory');
        fs.mkdirSync(memoryDir, { recursive: true });
        fs.writeFileSync(path.join(memoryDir, 'session_invalid_schema.json'), JSON.stringify({ cmd: 'forge_result' }, null, 2));

        const weave = new EngraveWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:engrave',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as WeaveInvocation<any>,
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'FAILURE');
        assert.match(result.error ?? '', /INVALID_SCHEMA/i);
        assert.ok(fs.existsSync(path.join(memoryDir, 'session_invalid_schema.json')));
        assert.ok(!fs.existsSync(path.join(memoryDir, 'archive', 'session_invalid_schema.json')));
    });

    it('archives a successful forge_result session and persists bead plus episodic memory records', async () => {
        const memoryDir = path.join(tmpRoot, '.agents', 'memory');
        fs.mkdirSync(memoryDir, { recursive: true });

        const beadId = 'bead-engrave-success';
        const sessionFileName = 'session_success.json';
        writeSessionFile(memoryDir, sessionFileName, [
            {
                cmd: 'forge_result',
                bead_id: beadId,
                task: 'Restore the completed weave result into the Hall.',
                target: 'src/node/core/runtime/weaves/engrave.ts',
                ts: 1700000000,
                result: {
                    status: 'success',
                    message: 'Completed successfully.',
                },
                metadata: {
                    source: 'unit-test',
                    cadence: 'archive',
                },
            },
        ]);

        const weave = new EngraveWeave();
        const result = await weave.execute(
            {
                weave_id: 'weave:engrave',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as WeaveInvocation<any>,
            createContext(tmpRoot),
        );

        assert.equal(result.status, 'SUCCESS');
        assert.equal(result.metadata?.files_processed, 1);
        assert.equal(result.metadata?.engrams_saved, 1);
        assert.ok(!fs.existsSync(path.join(memoryDir, sessionFileName)));
        assert.ok(fs.existsSync(path.join(memoryDir, 'archive', sessionFileName)));

        const bead = getHallBead(beadId);
        assert.ok(bead);
        assert.equal(bead?.repo_id, repoId);
        assert.equal(bead?.status, 'COMPLETED');
        assert.equal(bead?.target_path, 'src/node/core/runtime/weaves/engrave.ts');

        const memories = listHallEpisodicMemory(tmpRoot, beadId);
        assert.equal(memories.length, 1);
        assert.equal(memories[0]?.bead_id, beadId);
        assert.equal(memories[0]?.repo_id, repoId);
        assert.equal(memories[0]?.tactical_summary, 'Restore the completed weave result into the Hall.');
        assert.deepEqual(memories[0]?.files_touched, ['src/node/core/runtime/weaves/engrave.ts']);
        assert.deepEqual(memories[0]?.successes, ['Completed successfully.']);
        assert.deepEqual(memories[0]?.metadata, {
            source: 'unit-test',
            session_file: sessionFileName,
            original_ts: 1700000000,
            event_kind: 'forge_result',
            cadence: 'archive',
        });

        const secondPass = await weave.execute(
            {
                weave_id: 'weave:engrave',
                payload: {
                    project_root: tmpRoot,
                    cwd: tmpRoot,
                },
            } as WeaveInvocation<any>,
            createContext(tmpRoot),
        );

        assert.equal(secondPass.status, 'SUCCESS');
        assert.equal(secondPass.metadata?.files_processed, 0);
        assert.match(secondPass.output, /No ephemeral session files found/i);
    });
});
