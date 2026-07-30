import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { handlePersonaSet } from '../../../src/tools/cstar-kernel-mcp/tools/persona_set.js';
import { handleStatus } from '../../../src/tools/cstar-kernel-mcp/tools/status.js';
import { closeDb, getHallRepositoryRecord, upsertHallRepository } from '../../../src/tools/pennyone/intel/database.js';
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
        root = fs.mkdtempSync(path.join('/tmp', 'cstar-persona-set-root-'));
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

        codexHome = fs.mkdtempSync(path.join('/tmp', 'cstar-persona-set-codex-'));
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

    it('sets exact O.D.I.N. state, mirrors Hall, and is idempotent', async () => {
        const first = await handlePersonaSet({ persona: 'O.D.I.N.' }, context());
        const payload = JSON.parse(first.content[0]?.text ?? '{}');
        assert.equal(first.isError, undefined, first.content[0]?.text);
        assert.equal(payload.status, 'updated');
        assert.equal(payload.persona, 'O.D.I.N.');
        assert.equal(payload.previous_persona, 'A.L.F.R.E.D.');
        assert.equal(payload.effective_from, 'next_workflow_boundary');
        assert.equal(payload.authority, 'style_only_no_scope_or_gate_change');
        assert.equal(payload.operating_mode.mode, 'iterative_build_run_test_repair');
        assert.equal(payload.operating_mode.iteration_required, true);
        assert.equal(payload.hall_projection, 'updated');
        assert.doesNotMatch(JSON.stringify(payload), /PERSONA_SET_SECRET_CANARY|provider_token/);
        assert.equal(getHallRepositoryRecord(root, root)?.active_persona, 'O.D.I.N.');

        const status = JSON.parse((await handleStatus()).content[0]?.text ?? '{}');
        assert.equal(status.persona, 'O.D.I.N.');
        assert.equal(status.persona_projection_status, 'bounded_config_projection');

        const second = JSON.parse((await handlePersonaSet(
            { persona: 'O.D.I.N.' }, context(),
        )).content[0]?.text ?? '{}');
        assert.equal(second.status, 'already_active');
        assert.equal(second.persona, 'O.D.I.N.');
    });

    it('rejects subagent identity and noncanonical aliases before mutation', async () => {
        const original = fs.readFileSync(path.join(root, '.agents', 'config.json'));
        const subagent = await handlePersonaSet({ persona: 'O.D.I.N.' }, context(true));
        assert.equal(subagent.isError, true);
        assert.match(subagent.content[0]?.text ?? '', /codex_request_identity_rejects_parent_fork_or_subagent/);
        const alias = await handlePersonaSet({ persona: 'ODIN' as any }, context());
        assert.equal(alias.isError, true);
        assert.match(alias.content[0]?.text ?? '', /persona_canonical_value_required/);
        assert.deepEqual(fs.readFileSync(path.join(root, '.agents', 'config.json')), original);
    });
});
