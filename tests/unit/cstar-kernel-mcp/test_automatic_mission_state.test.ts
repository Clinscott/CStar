import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    AutomaticMissionController,
    createAutomaticMissionRecord,
    ingestAutomaticMission,
    transitionAutomaticMission,
} from '../../../src/tools/pennyone/intel/automatic_mission_controller.js';
import {
    buildAutomaticMissionInstructionText,
} from '../../../src/tools/pennyone/intel/automatic_mission_authority.js';
import type { AutomaticMissionDesign } from '../../../src/types/automatic_mission.js';
import { closeDb } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';

const NOW = 2_000_000;
const DESIGN: AutomaticMissionDesign = {
    root_task: 'task:cstar:auto-a1-state',
    targets: ['src/automatic_mission.ts'],
    outputs: ['bounded-result.json'],
    prohibitions: ['git_push', 'deploy', 'provider_launch'],
    retry_ceiling: 0,
    attempt_ceiling: 1,
    spend_ceiling: 0,
    expires_at: NOW + 30_000,
};
const originalRoot = registry.getRoot();
const roots: string[] = [];

afterEach(() => {
    closeDb();
    registry.setRoot(originalRoot);
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function durableController(): AutomaticMissionController {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-automatic-mission-state-'));
    roots.push(root);
    registry.setRoot(root);
    return new AutomaticMissionController({ code_root: root, control_root: root });
}

function fullInput() {
    const draft = createAutomaticMissionRecord({
        objective: 'Queue a bounded ordinary-language mission.',
        design: DESIGN,
    }, NOW);
    return {
        objective: draft.objective,
        design: DESIGN,
        root_user_record: {
            thread_id: 'thread:state-root',
            turn_id: 'turn:state-root',
            timestamp: '2026-08-02T14:00:00.000Z',
            text: buildAutomaticMissionInstructionText(draft, 'mission'),
        },
    };
}

describe('automatic mission deterministic state ingress', () => {
    it('returns typed needs_input through DRAFT to NEEDS_DESIGN without inventing authority', () => {
        const result = ingestAutomaticMission({
            objective: 'Design this mission in ordinary language.',
        }, { now: NOW });
        assert.equal(result.outcome, 'needs_input');
        assert.equal(result.kind, 'needs_input');
        assert.equal(result.status, 'needs_input');
        assert.equal(result.state, 'NEEDS_DESIGN');
        assert.equal(result.mission?.set_grant, null);
        assert.equal(result.error_code, 'automatic_mission_design_required');
    });

    it('requires a stable root-user record before SET binding', () => {
        const result = ingestAutomaticMission({
            objective: 'Bind a design but do not silently authorize it.',
            design: DESIGN,
        }, { now: NOW });
        assert.equal(result.outcome, 'needs_input');
        assert.equal(result.state, 'NEEDS_DESIGN');
        assert.equal(result.error_code, 'automatic_mission_root_user_record_required');
        assert.equal(result.mission?.root_user_record_set_sha256, null);
    });

    it('walks SET_BOUND, MATERIALIZED, and DISPATCH_QUEUED without launching a worker', () => {
        const result = ingestAutomaticMission(fullInput(), { now: NOW, queue_dispatch: true });
        assert.equal(result.outcome, 'ok', JSON.stringify(result));
        assert.equal(result.state, 'DISPATCH_QUEUED');
        assert.equal(result.mission?.set_grant?.status, 'BOUND');
        assert.equal(result.dispatch?.queued, true);
        assert.equal(result.dispatch?.launch_required_by_host, true);
        assert.equal(result.dispatch?.worker_launch_performed, false);
        assert.match(result.dispatch?.host_dispatch_id ?? '', /^host-dispatch:mission:cstar:/);
    });

    it('keeps state transitions narrow and rejects skipping SET authority', () => {
        const draft = createAutomaticMissionRecord({ objective: 'A state transition fixture.' }, NOW);
        const invalid = transitionAutomaticMission(draft, 'MATERIALIZED', NOW);
        assert.equal(invalid.outcome, 'guardrail_block');
        assert.equal(invalid.error_code, 'automatic_mission_state_transition_invalid');

        const needsDesign = transitionAutomaticMission(draft, 'NEEDS_DESIGN', NOW);
        assert.equal(needsDesign.outcome, 'ok');
        const missingGrant = transitionAutomaticMission(needsDesign.mission!, 'SET_BOUND', NOW);
        assert.equal(missingGrant.outcome, 'needs_input');
        assert.equal(missingGrant.error_code, 'automatic_mission_set_grant_required');
    });

    it('derives stable IDs and makes a same-key controller replay idempotent', () => {
        const firstRecord = createAutomaticMissionRecord(fullInput(), NOW);
        const secondRecord = createAutomaticMissionRecord({
            ...fullInput(),
            root_user_record: {
                ...fullInput().root_user_record,
                text: 'Status is informational.',
            },
        }, NOW + 10);
        assert.deepEqual(
            [firstRecord.mission_id, firstRecord.decision_id, firstRecord.bead_id,
                firstRecord.request_id, firstRecord.request_sha256, firstRecord.idempotency_key],
            [secondRecord.mission_id, secondRecord.decision_id, secondRecord.bead_id,
                secondRecord.request_id, secondRecord.request_sha256, secondRecord.idempotency_key],
        );

        const controller = durableController();
        const first = controller.ingest(fullInput(), { now: NOW, queue_dispatch: true });
        const replay = controller.ingest(fullInput(), { now: NOW + 10, queue_dispatch: true });
        assert.equal(first.outcome, 'ok');
        assert.equal(replay.outcome, 'ok');
        assert.equal(replay.idempotent_replay, true);
        assert.equal(replay.mission?.mission_id, first.mission?.mission_id);
        assert.equal(replay.mission?.dispatch_queued_at, NOW);
    });

    it('blocks reuse of one idempotency key for a different request', () => {
        const controller = durableController();
        const firstInput = {
            ...fullInput(),
            idempotency_key: 'cstar-a1-one-shot',
        };
        const firstDraft = createAutomaticMissionRecord({
            objective: firstInput.objective,
            design: firstInput.design,
            idempotency_key: firstInput.idempotency_key,
        }, NOW);
        firstInput.root_user_record.text = buildAutomaticMissionInstructionText(firstDraft, 'mission');
        const first = controller.ingest(firstInput, { now: NOW, queue_dispatch: true });
        const conflict = controller.ingest({
            ...firstInput,
            objective: 'A different bounded mission must not inherit the first grant.',
        }, { now: NOW + 1, queue_dispatch: true });
        assert.equal(first.outcome, 'ok');
        assert.equal(conflict.outcome, 'guardrail_block');
        assert.equal(conflict.error_code, 'automatic_mission_idempotency_conflict');
        assert.equal(conflict.mission?.mission_id, first.mission?.mission_id);
    });

    it('returns an A2-compatible typed outcome for guardrail and internal boundaries', () => {
        const malformed = ingestAutomaticMission({
            objective: 'Invalid ceiling mission.',
            design: { ...DESIGN, attempt_ceiling: 0 },
        }, { now: NOW });
        assert.equal(malformed.outcome, 'needs_input');
        assert.ok(['ok', 'needs_input', 'guardrail_block', 'domain_terminal', 'transport_error', 'internal_error']
            .includes(malformed.kind));
        assert.equal(malformed.kind, malformed.outcome);
        assert.equal(malformed.status, malformed.outcome);
    });
});
