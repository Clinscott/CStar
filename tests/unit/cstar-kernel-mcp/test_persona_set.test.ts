import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { handlePersonaSet } from '../../../src/tools/cstar-kernel-mcp/tools/persona_set.js';
import { handleStatus } from '../../../src/tools/cstar-kernel-mcp/tools/status.js';
import {
    closeDb,
    getHallRepositoryRecord,
    getWritableDb,
    upsertHallRepository,
} from '../../../src/tools/pennyone/intel/database.js';
import {
    readCanonicalPersonaState,
} from '../../../src/tools/pennyone/intel/persona_state.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

describe('cstar_persona_set', () => {
    let root: string;
    let codexHome: string;
    let originalRoot: string;
    let originalCodexHome: string | undefined;
    let threadId: string;
    let turnId: string;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        originalCodexHome = process.env.CODEX_HOME;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-set-root-'));
        fs.chmodSync(root, 0o700);
        const agents = path.join(root, '.agents');
        fs.mkdirSync(agents, { mode: 0o700 });
        fs.writeFileSync(path.join(agents, 'config.json'), JSON.stringify({
            system: { persona: 'A.L.F.R.E.D.' },
            provider_token: 'PERSONA_SET_SECRET_CANARY',
        }), { mode: 0o600 });
        registry.setRoot(root);
        closeDb();
        upsertHallRepository({
            root_path: root,
            name: 'persona-set-fixture',
            status: 'AWAKE',
            active_persona: '',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: {},
            created_at: Date.now(),
            updated_at: Date.now(),
        });

        codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-set-codex-'));
        threadId = randomUUID();
        turnId = randomUUID();
        const timestamp = new Date().toISOString();
        const sessionDir = path.join(codexHome, 'sessions', '2026', '07', '17');
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(path.join(sessionDir, `rollout-${threadId}.jsonl`), [
            JSON.stringify({
                timestamp,
                type: 'session_meta',
                payload: {
                    id: threadId,
                    thread_source: 'user',
                    parent_thread_id: null,
                    agent_path: null,
                    forked_from_id: null,
                },
            }),
            JSON.stringify({
                timestamp,
                type: 'response_item',
                payload: {
                    type: 'message',
                    role: 'user',
                    content: [{ type: 'input_text', text: 'Switch CStar to O.D.I.N. for the next workflow.' }],
                    internal_chat_message_metadata_passthrough: { turn_id: turnId },
                },
            }),
            '',
        ].join('\n'), { mode: 0o600 });
        process.env.CODEX_HOME = codexHome;
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
        else process.env.CODEX_HOME = originalCodexHome;
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(codexHome, { recursive: true, force: true });
    });

    function context(subagent = false) {
        return {
            requestId: 17,
            _meta: {
                threadId,
                'x-codex-turn-metadata': {
                    session_id: threadId,
                    thread_id: threadId,
                    turn_id: turnId,
                    thread_source: 'user',
                    parent_thread_id: subagent ? randomUUID() : null,
                    forked_from_thread_id: null,
                    subagent_kind: subagent ? 'reviewer' : null,
                },
            },
        };
    }

    function payload(response: { content: Array<{ text?: string }> }) {
        return JSON.parse(response.content[0]?.text ?? '{}') as Record<string, any>;
    }

    it('uses dedicated Hall state, preserves config, and returns an idempotent receipt', async () => {
        const configBefore = fs.readFileSync(path.join(root, '.agents', 'config.json'));
        const first = payload(await handlePersonaSet({
            persona: 'O.D.I.N.', expected_current: 'A.L.F.R.E.D.',
        }, context()));

        assert.equal(first.outcome, 'changed');
        assert.equal(first.previous, 'A.L.F.R.E.D.');
        assert.equal(first.current, 'O.D.I.N.');
        assert.match(first.receipt_id, /^persona-set-[a-f0-9]{64}$/);
        assert.equal(first.effective_boundary, 'next_workflow_boundary');
        assert.equal(first.authority_effect, 'process_only');
        assert.deepEqual(readCanonicalPersonaState(root), {
            active_persona: 'O.D.I.N.',
            status: 'projected',
            revision: 1,
            receipt_id: first.receipt_id,
        });
        assert.equal(getHallRepositoryRecord(root, root)?.active_persona, '');
        assert.deepEqual(fs.readFileSync(path.join(root, '.agents', 'config.json')), configBefore);
        assert.doesNotMatch(JSON.stringify(first), /PERSONA_SET_SECRET_CANARY|provider_token/);

        const status = payload(await handleStatus());
        assert.equal(status.persona, 'O.D.I.N.');
        assert.equal(status.persona_projection_status, 'self_consistent_unverified');

        const retry = payload(await handlePersonaSet({ persona: 'O.D.I.N.' }, context()));
        assert.equal(retry.outcome, 'noop');
        assert.equal(retry.previous, 'O.D.I.N.');
        assert.equal(retry.current, 'O.D.I.N.');
        assert.equal(retry.receipt_id, first.receipt_id);
    });

    it('seeds canonical Hall state on a same-value first call and keeps its noop receipt', async () => {
        const first = payload(await handlePersonaSet({
            persona: 'A.L.F.R.E.D.', expected_current: 'A.L.F.R.E.D.',
        }, context()));

        assert.equal(first.outcome, 'noop');
        assert.equal(first.previous, 'A.L.F.R.E.D.');
        assert.equal(first.current, 'A.L.F.R.E.D.');
        assert.match(first.receipt_id, /^persona-set-[a-f0-9]{64}$/);
        assert.deepEqual(readCanonicalPersonaState(root), {
            active_persona: 'A.L.F.R.E.D.',
            status: 'projected',
            revision: 1,
            receipt_id: first.receipt_id,
        });

        fs.writeFileSync(path.join(root, '.agents', 'config.json'), JSON.stringify({
            system: { persona: 'O.D.I.N.' },
            provider_token: 'REPLACEMENT_SECRET_CANARY',
        }), { mode: 0o600 });
        const status = payload(await handleStatus());
        assert.equal(status.persona, 'A.L.F.R.E.D.');
        assert.equal(status.persona_projection_status, 'self_consistent_unverified');
        assert.doesNotMatch(JSON.stringify(status), /REPLACEMENT_SECRET_CANARY|provider_token/);

        const repeated = payload(await handlePersonaSet({ persona: 'A.L.F.R.E.D.' }, context()));
        assert.equal(repeated.outcome, 'noop');
        assert.equal(repeated.previous, 'A.L.F.R.E.D.');
        assert.equal(repeated.current, 'A.L.F.R.E.D.');
        assert.equal(repeated.receipt_id, first.receipt_id);
        assert.deepEqual(readCanonicalPersonaState(root), {
            active_persona: 'A.L.F.R.E.D.',
            status: 'projected',
            revision: 1,
            receipt_id: first.receipt_id,
        });
    });

    it('blocks a stale first expectation against migration state with zero canonical rows', async () => {
        const stale = payload(await handlePersonaSet({
            persona: 'A.L.F.R.E.D.', expected_current: 'O.D.I.N.',
        }, context()));

        assert.equal(stale.outcome, 'blocked');
        assert.equal(stale.previous, 'A.L.F.R.E.D.');
        assert.equal(stale.current, 'A.L.F.R.E.D.');
        assert.match(stale.receipt_id, /^persona-set-[a-f0-9]{64}$/);
        assert.equal(readCanonicalPersonaState(root).status, 'absent');
        const rowCount = getWritableDb(root).prepare(
            'SELECT COUNT(*) FROM hall_persona_state',
        ).pluck().get();
        assert.equal(rowCount, 0);
    });

    it('blocks stale expected_current without a write and keeps the block receipt deterministic', async () => {
        payload(await handlePersonaSet({
            persona: 'O.D.I.N.', expected_current: 'A.L.F.R.E.D.',
        }, context()));
        const before = readCanonicalPersonaState(root);
        const stale = payload(await handlePersonaSet({
            persona: 'A.L.F.R.E.D.', expected_current: 'A.L.F.R.E.D.',
        }, context()));
        const repeated = payload(await handlePersonaSet({
            persona: 'A.L.F.R.E.D.', expected_current: 'A.L.F.R.E.D.',
        }, context()));

        assert.equal(stale.outcome, 'blocked');
        assert.equal(stale.previous, 'O.D.I.N.');
        assert.equal(stale.current, 'O.D.I.N.');
        assert.equal(stale.effective_boundary, 'next_workflow_boundary');
        assert.equal(stale.authority_effect, 'process_only');
        assert.equal(stale.receipt_id, repeated.receipt_id);
        assert.deepEqual(readCanonicalPersonaState(root), before);
    });

    it('allows only exact enum values and preserves config on rejected identity/input', async () => {
        const original = fs.readFileSync(path.join(root, '.agents', 'config.json'));
        const subagent = await handlePersonaSet({ persona: 'O.D.I.N.' }, context(true));
        assert.equal(subagent.isError, true);
        assert.match(subagent.content[0]?.text ?? '', /codex_request_identity_rejects_parent_fork_or_subagent/);

        const alias = await handlePersonaSet({ persona: 'ODIN' as any }, context());
        assert.equal(alias.isError, true);
        assert.match(alias.content[0]?.text ?? '', /persona_canonical_value_required/);

        const expectedAlias = await handlePersonaSet({
            persona: 'O.D.I.N.', expected_current: 'ODIN' as any,
        }, context());
        assert.equal(expectedAlias.isError, true);
        assert.match(expectedAlias.content[0]?.text ?? '', /expected_current_canonical_value_required/);
        assert.deepEqual(fs.readFileSync(path.join(root, '.agents', 'config.json')), original);
        assert.equal(readCanonicalPersonaState(root).status, 'absent');
    });

    it('serializes concurrent stale writers with one change and one block', async () => {
        const responses = await Promise.all([
            handlePersonaSet({ persona: 'O.D.I.N.', expected_current: 'A.L.F.R.E.D.' }, context()),
            handlePersonaSet({ persona: 'O.D.I.N.', expected_current: 'A.L.F.R.E.D.' }, context()),
        ]);
        const results = responses.map(payload);
        assert.deepEqual(results.map((result) => result.outcome).sort(), ['blocked', 'changed']);
        const changed = results.find((result) => result.outcome === 'changed');
        const blocked = results.find((result) => result.outcome === 'blocked');
        assert.ok(changed);
        assert.ok(blocked);
        assert.equal(blocked.previous, 'O.D.I.N.');
        assert.equal(blocked.current, 'O.D.I.N.');
        assert.deepEqual(readCanonicalPersonaState(root), {
            active_persona: 'O.D.I.N.',
            status: 'projected',
            revision: 1,
            receipt_id: changed.receipt_id,
        });
    });
});
