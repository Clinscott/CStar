import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
    STATE_REGISTRY_MUTATION_RETIRED_ERROR,
    StateRegistry,
} from '../../src/node/core/state.js';
import {
    closeDb,
    saveHallAgentPresence,
    saveHallMountedSpoke,
    upsertHallRepository,
} from '../../src/tools/pennyone/intel/database.js';
import { setCanonicalPersonaState } from '../../src/tools/pennyone/intel/persona_state.js';
import { registry } from '../../src/tools/pennyone/pathRegistry.js';
import { buildPersonaProjectionMetadata } from '../../src/tools/pennyone/persona_projection.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../src/types/hall.js';

type Snapshot = Record<string, string>;

function snapshotTree(root: string): Snapshot {
    const result: Snapshot = {};
    const visit = (directory: string): void => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(absolute);
            else result[path.relative(root, absolute)] = createHash('sha256')
                .update(fs.readFileSync(absolute)).digest('hex');
        }
    };
    visit(root);
    return result;
}

describe('read-only StateRegistry compatibility boundary', () => {
    let root: string;
    let originalRoot: string;
    let originalControlRoot: string | undefined;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        originalControlRoot = process.env.CSTAR_CONTROL_ROOT;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-state-readonly-'));
        registry.setRoot(root);
        process.env.CSTAR_CONTROL_ROOT = root;
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        if (originalControlRoot === undefined) delete process.env.CSTAR_CONTROL_ROOT;
        else process.env.CSTAR_CONTROL_ROOT = originalControlRoot;
        fs.rmSync(root, { recursive: true, force: true });
    });

    function seedRepository(): string {
        const repoId = buildHallRepositoryId(normalizeHallPath(root));
        upsertHallRepository({
            repo_id: repoId,
            root_path: root,
            name: path.basename(root),
            status: 'AGENT_LOOP',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 7,
            intent_integrity: 93,
            metadata: {
                source: 'synthetic-state-readonly-test',
                ...buildPersonaProjectionMetadata('O.D.I.N.'),
                sovereign_projection: {
                    identity: { name: 'untrusted metadata identity' },
                    blackboard: [{ message: 'untrusted metadata message' }],
                    terminal_logs: ['untrusted metadata log'],
                },
            },
            created_at: 1,
            updated_at: 2,
        });
        setCanonicalPersonaState(root, 'O.D.I.N.');
        return repoId;
    }

    it('ignores legacy JSON and arbitrary repository projection objects', () => {
        fs.mkdirSync(path.join(root, '.agents'));
        fs.writeFileSync(path.join(root, '.agents', 'sovereign_state.json'), JSON.stringify({
            framework: { active_persona: 'SECRET_PERSONA', active_task: 'legacy task' },
            identity: { name: 'legacy identity' },
            secret_sentinel: 'must-not-project',
        }));
        seedRepository();

        const state = StateRegistry.get();
        assert.equal(state.framework.status, 'AGENT_LOOP');
        assert.equal(state.framework.active_persona, 'O.D.I.N.');
        assert.equal(state.framework.gungnir_score, 7);
        assert.equal(state.framework.intent_integrity, 93);
        assert.equal(state.framework.active_task, undefined);
        assert.equal(state.identity.name, 'CStar');
        assert.deepEqual(state.blackboard, []);
        assert.deepEqual(state.terminal_logs, []);
        assert.doesNotMatch(JSON.stringify(state), /SECRET_PERSONA|must-not-project|untrusted metadata/);
    });

    it('projects only canonical mounted-spoke and agent-presence tables', () => {
        const repoId = seedRepository();
        saveHallMountedSpoke({
            spoke_id: 'spoke:synthetic',
            repo_id: repoId,
            slug: 'synthetic',
            kind: 'local',
            root_path: '/synthetic/spoke',
            mount_status: 'active',
            trust_level: 'observe',
            write_policy: 'read_only',
            projection_status: 'current',
            metadata: { source: 'synthetic' },
            created_at: 3,
            updated_at: 4,
        });
        saveHallAgentPresence({
            repo_id: repoId,
            agent_id: 'synthetic-agent',
            name: 'Synthetic Agent',
            status: 'WORKING',
            current_task: 'bounded fixture',
            metadata: { source: 'synthetic' },
            created_at: 3,
            updated_at: 4,
        }, root);

        const state = StateRegistry.get();
        assert.deepEqual(state.managed_spokes.map((spoke) => spoke.slug), ['synthetic']);
        assert.deepEqual(state.agents['synthetic-agent'], {
            id: 'synthetic-agent',
            name: 'Synthetic Agent',
            status: 'WORKING',
            last_seen: 4,
            current_task: 'bounded fixture',
            active_bead_id: undefined,
            pid: undefined,
        });
    });

    it('retires every mutation method before Hall or filesystem effects', () => {
        seedRepository();
        const state = StateRegistry.get();
        closeDb();
        const before = snapshotTree(root);
        const calls = [
            () => StateRegistry.updateMission('mission', 'task', 'bead'),
            () => StateRegistry.updateFramework({ status: 'AWAKE' }),
            () => StateRegistry.postToBlackboard({ from: 'test', message: 'message', type: 'INFO' }),
            () => StateRegistry.pushTerminalLog('log'),
            () => StateRegistry.save(state),
        ];
        for (const call of calls) {
            assert.throws(call, new RegExp(STATE_REGISTRY_MUTATION_RETIRED_ERROR));
        }
        assert.deepEqual(snapshotTree(root), before);

        const source = fs.readFileSync(path.join(originalRoot, 'src/node/core/state.ts'), 'utf8');
        assert.doesNotMatch(source, /readFile|writeFile|mkdirSync|randomUUID|getWritableDb|saveHall|upsertHall/);
    });
});
