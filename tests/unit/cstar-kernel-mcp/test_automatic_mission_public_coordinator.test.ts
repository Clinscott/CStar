import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    cstarMissionCoordinatorSchema,
} from '../../../src/tools/cstar-kernel-mcp/contracts/automatic_mission.js';
import {
    handleCstarMission,
} from '../../../src/tools/cstar-kernel-mcp/tools/automatic_mission_coordinator.js';
import type { McpTextResponse } from '../../../src/tools/cstar-kernel-mcp/contracts/responses.js';
import {
    buildAutomaticMissionInstructionText,
} from '../../../src/tools/pennyone/intel/automatic_mission_authority.js';
import {
    AutomaticMissionController,
    createAutomaticMissionRecord,
} from '../../../src/tools/pennyone/intel/automatic_mission_controller.js';
import { closeDb } from '../../../src/tools/pennyone/intel/database.js';
import type {
    AutomaticMissionCompatibilityProfile,
    AutomaticMissionDesign,
} from '../../../src/types/automatic_mission.js';

const ROOT_THREAD = 'thread:public-coordinator';
const ROOT_TURN = 'turn:public-coordinator';
const ROOT_TIMESTAMP = '2026-08-08T00:00:00.000Z';
const roots: string[] = [];

afterEach(() => {
    closeDb();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function controller(): AutomaticMissionController {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-public-mission-'));
    roots.push(root);
    return new AutomaticMissionController({ code_root: root, control_root: root });
}

function readPayload(response: McpTextResponse): Record<string, any> {
    const text = response.content[0]?.text;
    if (!text) throw new Error('public coordinator response was empty');
    return JSON.parse(text) as Record<string, any>;
}

function publicInput(options: {
    idempotency_key?: string;
    compatibility_profile?: AutomaticMissionCompatibilityProfile;
} = {}) {
    const compatibilityProfile = options.compatibility_profile ?? 'cstar_mission_v1';
    const objective = 'Implement one ordinary bounded public mission intent.';
    const design: AutomaticMissionDesign = {
        root_task: 'task:cstar:public-coordinator',
        targets: ['src/tools/cstar-kernel-mcp/tools/automatic_mission.ts'],
        outputs: ['public-mission-receipt.json'],
        prohibitions: ['git_push', 'deploy', 'provider_launch'],
        retry_ceiling: 0,
        attempt_ceiling: 1,
        spend_ceiling: 0,
        expires_at: Date.now() + 60_000,
    };
    const expandedDesign: AutomaticMissionDesign = {
        ...design,
        adapter: { adapter_ref: 'cstar-host-dispatch', capability: 'state_only' },
        callback: {
            callback_required: true,
            expected_packet: 'CSTAR_MISSION_RESULT',
            callback_thread_id: ROOT_THREAD,
        },
    };
    const draft = createAutomaticMissionRecord({
        objective,
        design: expandedDesign,
        compatibility_profile: compatibilityProfile,
        ...(options.idempotency_key ? { idempotency_key: options.idempotency_key } : {}),
    }, Date.now());
    return {
        objective,
        design,
        compatibility_profile: compatibilityProfile,
        ...(options.idempotency_key ? { idempotency_key: options.idempotency_key } : {}),
        root_user_record: {
            thread_id: ROOT_THREAD,
            turn_id: ROOT_TURN,
            timestamp: ROOT_TIMESTAMP,
            text: buildAutomaticMissionInstructionText(draft, 'mission'),
            ...(compatibilityProfile === 'legacy_singleton_v1'
                ? { raw_line: 'legacy singleton compatibility record' }
                : {}),
        },
    };
}

describe('public cstar_mission coordinator facade', () => {
    it('accepts ordinary intent defaults while rejecting caller-owned derived fields', () => {
        const parsed = cstarMissionCoordinatorSchema.parse({
            objective: 'Draft one bounded mission.',
        });
        assert.equal(parsed.compatibility_profile, 'cstar_mission_v1');
        assert.equal(parsed.action, 'materialize');
        assert.equal(parsed.queue_dispatch, false);
        assert.equal(Object.hasOwn(parsed, 'mission_id'), false);
        assert.throws(
            () => cstarMissionCoordinatorSchema.parse({
                objective: 'Inject a derived mission identity.',
                request_sha256: 'a'.repeat(64),
            }),
            /unrecognized|Unrecognized key/i,
        );
    });

    it('returns typed needs_input with no queue when design is missing', async () => {
        const testController = controller();
        const result = readPayload(await handleCstarMission(
            { objective: 'Design this bounded mission.' },
            undefined,
            { controller: testController },
        ));

        assert.equal(result.outcome, 'needs_input');
        assert.equal(result.kind, 'needs_input');
        assert.equal(result.state, 'NEEDS_DESIGN');
        assert.match(result.next_action, /design|authority/i);
        assert.equal(result.dispatch, undefined);
        assert.equal(testController.get(result.mission.mission_id), undefined);
    });

    it('derives immutable fields and adapter/callback defaults before materialization', async () => {
        const result = readPayload(await handleCstarMission(
            publicInput(),
            undefined,
            { controller: controller() },
        ));

        assert.equal(result.outcome, 'ok');
        assert.equal(result.state, 'MATERIALIZED');
        assert.match(result.mission.mission_id, /^mission:cstar:[a-f0-9]{32}$/);
        assert.match(result.mission.request_sha256, /^[a-f0-9]{64}$/);
        assert.match(result.mission.binding_sha256, /^[a-f0-9]{64}$/);
        assert.equal(result.mission.adapter.adapter_ref, 'cstar-host-dispatch');
        assert.equal(result.mission.adapter.capability, 'state_only');
        assert.equal(result.mission.callback.callback_required, true);
        assert.equal(result.mission.callback.expected_packet, 'CSTAR_MISSION_RESULT');
        assert.equal(result.mission.callback.callback_thread_id, ROOT_THREAD);
        assert.match(result.next_action, /queue durable host work/i);
    });

    it('preserves the explicit legacy singleton compatibility profile', async () => {
        const result = readPayload(await handleCstarMission(
            { ...publicInput({ compatibility_profile: 'legacy_singleton_v1' }), action: 'bind' },
            undefined,
            { controller: controller() },
        ));

        assert.equal(result.outcome, 'ok');
        assert.equal(result.state, 'SET_BOUND');
        assert.equal(result.mission.compatibility_profile, 'legacy_singleton_v1');
        assert.equal(result.mission.root_user_records.length, 1);
        assert.match(result.mission.root_user_records[0].record_set_sha256, /^[a-f0-9]{64}$/);
        assert.match(result.next_action, /derived|authority/i);
    });

    it('queues idempotently without reporting worker or lifecycle completion', async () => {
        const testController = controller();
        const input = {
            ...publicInput({ idempotency_key: 'public-coordinator-replay' }),
            action: 'queue_dispatch' as const,
            queue_dispatch: true,
        };
        const first = readPayload(await handleCstarMission(input, undefined, {
            controller: testController,
        }));
        const replay = readPayload(await handleCstarMission(input, undefined, {
            controller: testController,
        }));

        assert.equal(first.outcome, 'ok');
        assert.equal(first.state, 'DISPATCH_QUEUED');
        assert.equal(first.dispatch.queued, true);
        assert.equal(first.dispatch.launch_required_by_host, true);
        assert.equal(first.dispatch.worker_launch_performed, false);
        assert.equal(first.completed, undefined);
        assert.equal(first.validated, undefined);
        assert.match(first.next_action, /does not launch workers/i);
        assert.equal(replay.outcome, 'ok');
        assert.equal(replay.idempotent_replay, true);
        assert.equal(replay.mission.mission_id, first.mission.mission_id);
        assert.equal(replay.mission.request_sha256, first.mission.request_sha256);
        assert.equal(replay.dispatch.worker_launch_performed, false);
        assert.match(replay.next_action, /delivery remains unverified/i);
    });
});
