import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    bindAutomaticMissionAuthority,
    buildAutomaticMissionInstructionText,
    classifyAutomaticMissionInstruction,
    consumeAutomaticMissionSetGrant,
    containsExactMissionIdentifier,
    isAutomaticMissionRevocation,
    revokeAutomaticMissionSetGrant,
    verifyAutomaticMissionSetGrant,
} from '../../../src/tools/pennyone/intel/automatic_mission_authority.js';
import {
    createAutomaticMissionRecord,
} from '../../../src/tools/pennyone/intel/automatic_mission_controller.js';
import {
    hashLegacySingletonRecordSetV1,
    legacySingletonV1MessageBytes,
} from '../../../src/tools/pennyone/intel/automatic_mission_schema.js';
import type { AutomaticMissionDesign, AutomaticMissionRecord } from '../../../src/types/automatic_mission.js';

const NOW = 1_000_000;
const DESIGN: AutomaticMissionDesign = {
    description: 'Bounded synthetic mission design.',
    root_task: 'task:cstar:auto-a1',
    targets: ['src/mission.ts', 'tests/mission.test.ts'],
    outputs: ['mission-receipt.json'],
    prohibitions: ['git_push', 'deploy', 'provider_launch'],
    retry_ceiling: 1,
    attempt_ceiling: 2,
    spend_ceiling: 0,
    expires_at: NOW + 60_000,
    adapter: { adapter_ref: 'cstar-host-dispatch', capability: 'project_files' },
    callback: { callback_thread_id: 'thread:callback', expected_packet: 'MISSION_RESULT' },
    validator: { validator_id: 'validator:cstar-independent', ticket_ref: 'ticket:pending' },
};

function draft(): AutomaticMissionRecord {
    return createAutomaticMissionRecord({
        objective: 'Implement the bounded A1 mission ingress contract.',
        design: DESIGN,
    }, NOW);
}

function missionWithText(text: string, extra: Array<{ text: string }> = []): AutomaticMissionRecord {
    const base = draft();
    return createAutomaticMissionRecord({
        objective: base.objective,
        design: DESIGN,
        root_user_records: [
            { thread_id: 'thread:root', turn_id: 'turn:root', timestamp: '2026-08-02T14:00:00.000Z', text },
            ...extra.map((record, index) => ({
                thread_id: 'thread:root',
                turn_id: 'turn:root',
                timestamp: `2026-08-02T14:00:0${index + 1}.000Z`,
                text: record.text,
            })),
        ],
    }, NOW);
}

function exactMissionText(): string {
    return buildAutomaticMissionInstructionText(draft(), 'mission');
}

function exactReceiptText(): string {
    return buildAutomaticMissionInstructionText(draft(), 'receipt');
}

describe('automatic mission SET authority', () => {
    it('binds the full bounded mission and never derives identity from root prose', () => {
        const base = draft();
        const mission = missionWithText(exactMissionText());
        assert.deepEqual(
            [mission.mission_id, mission.decision_id, mission.bead_id, mission.request_id,
                mission.request_sha256, mission.idempotency_key],
            [base.mission_id, base.decision_id, base.bead_id, base.request_id,
                base.request_sha256, base.idempotency_key],
        );
        const { binding, grant } = bindAutomaticMissionAuthority({ mission, now: NOW });
        assert.equal(binding.grant_kind, 'mission');
        assert.equal(grant.status, 'BOUND');
        assert.equal(grant.mission_id, mission.mission_id);
        assert.equal(grant.root_task, DESIGN.root_task);
        assert.deepEqual(grant.targets, DESIGN.targets);
        assert.deepEqual(grant.outputs, DESIGN.outputs);
        assert.deepEqual(grant.prohibitions, [...DESIGN.prohibitions!].sort());
        assert.equal(grant.retry_ceiling, DESIGN.retry_ceiling);
        assert.equal(grant.attempt_ceiling, DESIGN.attempt_ceiling);
        assert.equal(grant.spend_ceiling, DESIGN.spend_ceiling);
        assert.equal(grant.expires_at, DESIGN.expires_at);
        assert.equal(grant.adapter?.adapter_ref, DESIGN.adapter?.adapter_ref);
        assert.equal(grant.callback?.expected_packet, DESIGN.callback?.expected_packet);
        assert.equal(grant.validator?.validator_id, DESIGN.validator?.validator_id);
        assert.match(grant.authority_binding_sha256, /^[a-f0-9]{64}$/);
        assert.doesNotThrow(() => verifyAutomaticMissionSetGrant(mission, grant, NOW + 1));
    });

    it('accepts informational records but selects exactly one operative mission or receipt grant', () => {
        const mission = missionWithText(exactMissionText(), [{ text: 'Status is informational.' }]);
        assert.equal(classifyAutomaticMissionInstruction('Status is informational.', mission), 'informational');
        assert.equal(bindAutomaticMissionAuthority({ mission, now: NOW }).binding.record_count, 2);

        const receipt = missionWithText(exactReceiptText());
        assert.equal(
            bindAutomaticMissionAuthority({ mission: receipt, now: NOW }).binding.grant_kind,
            'receipt',
        );
    });

    it('treats explicit mission constraints as the outer SET ceiling', () => {
        const constrainedDesign = {
            ...DESIGN,
            retry_ceiling: 4,
            attempt_ceiling: 5,
            spend_ceiling: 99,
        };
        const constraints = {
            retry_ceiling: 0,
            attempt_ceiling: 1,
            spend_ceiling: 0,
            expires_at: NOW + 30_000,
        };
        const base = createAutomaticMissionRecord({
            objective: 'Constrain the SET grant at the mission boundary.',
            design: constrainedDesign,
            constraints,
        }, NOW);
        const mission = createAutomaticMissionRecord({
            objective: base.objective,
            design: constrainedDesign,
            constraints,
            root_user_record: {
                thread_id: 'thread:constraint-root',
                turn_id: 'turn:constraint-root',
                timestamp: '2026-08-02T14:00:00.000Z',
                text: buildAutomaticMissionInstructionText(base, 'mission'),
            },
        }, NOW);
        const { grant } = bindAutomaticMissionAuthority({ mission, now: NOW });
        assert.equal(grant.retry_ceiling, 0);
        assert.equal(grant.attempt_ceiling, 1);
        assert.equal(grant.spend_ceiling, 0);
        assert.equal(grant.expires_at, constraints.expires_at);
    });

    it('rejects duplicate operative grants and mixed receipt/mission grants', () => {
        assert.throws(
            () => bindAutomaticMissionAuthority({
                mission: missionWithText(exactMissionText(), [{ text: exactMissionText() }]),
                now: NOW,
            }),
            /automatic_mission_authority_ambiguous/,
        );
        assert.throws(
            () => bindAutomaticMissionAuthority({
                mission: missionWithText(exactMissionText(), [{ text: exactReceiptText() }]),
                now: NOW,
            }),
            /automatic_mission_authority_ambiguous/,
        );
    });

    it('rejects questions, conditionals, quotes, reports, modals, and negations', () => {
        const grant = exactMissionText();
        const variants = [
            `${grant}?`,
            `If approval arrives, ${grant}`,
            `For example, ${grant}`,
            `"${grant}"`,
            `The report recommends ${grant}`,
            `Maybe ${grant}`,
            `We should discuss whether to ${grant}`,
            `I am not authorizing this. ${grant}`,
            `Do not proceed. ${grant}`,
            `${grant} but not`,
            `${grant} however not`,
        ];
        for (const text of variants) {
            assert.throws(
                () => bindAutomaticMissionAuthority({ mission: missionWithText(text), now: NOW }),
                /automatic_mission_authority_(nonoperative_text|revoked)/,
                text,
            );
        }
        for (const text of ['Stop.', 'Pause!', 'Cancel it.', 'Revoke this.', 'Withdraw that.', 'Never mind.', 'Do not continue.']) {
            assert.equal(isAutomaticMissionRevocation(text), true, text);
            assert.throws(
                () => bindAutomaticMissionAuthority({ mission: missionWithText(text), now: NOW }),
                /automatic_mission_authority_revoked/,
            );
        }
    });

    it('uses the complete identifier alphabet for suffix-collision rejection', () => {
        const mission = draft();
        const suffixes = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_:./-';
        for (const suffix of suffixes) {
            const text = `Authorize cstar_mission ${mission.mission_id}${suffix} for ${mission.decision_id} on ${mission.bead_id} now.`;
            assert.equal(classifyAutomaticMissionInstruction(text, mission), 'nonoperative', suffix);
            assert.throws(
                () => bindAutomaticMissionAuthority({ mission: missionWithText(text), now: NOW }),
                /automatic_mission_authority_nonoperative_text/,
                suffix,
            );
        }
        assert.equal(containsExactMissionIdentifier(`x ${mission.mission_id}.`, mission.mission_id), false);
        assert.equal(containsExactMissionIdentifier(`x ${mission.mission_id} `, mission.mission_id), true);
    });

    it('preserves the exact singleton-v1 record-set and message bytes on the compatibility path', () => {
        const legacyDraft = createAutomaticMissionRecord({
            objective: draft().objective,
            design: DESIGN,
            compatibility_profile: 'legacy_singleton_v1',
        }, NOW);
        const legacyText = `  ${buildAutomaticMissionInstructionText(legacyDraft, 'mission')}\n`;
        const mission = createAutomaticMissionRecord({
            objective: draft().objective,
            design: DESIGN,
            compatibility_profile: 'legacy_singleton_v1',
            root_user_record: {
                thread_id: 'thread:legacy',
                turn_id: 'turn:legacy',
                timestamp: '2026-08-02T14:00:00.000Z',
                raw_line: '{"legacy":true}',
                text: legacyText,
            },
        }, NOW);
        const record = mission.root_user_records[0]!;
        assert.match(record.record_sha256, /^[a-f0-9]{64}$/);
        assert.equal(record.text, legacyText);
        assert.equal(record.content?.[0]?.text, legacyText);
        assert.equal(
            record.record_set_sha256,
            hashLegacySingletonRecordSetV1(record),
        );
        assert.equal(
            legacySingletonV1MessageBytes(record),
            JSON.stringify({
                schema: 'cstar.forge_operator_intent_message.v1',
                thread_id: record.thread_id,
                turn_id: record.turn_id,
                records: [{ index: 0, record_sha256: record.record_sha256, content: record.content }],
            }),
        );
        assert.equal(bindAutomaticMissionAuthority({ mission, now: NOW }).binding.record_count, 1);
    });

    it('scopes replay, expiry, revocation, and tampering to the one bounded grant', () => {
        const mission = missionWithText(exactMissionText());
        const { grant } = bindAutomaticMissionAuthority({ mission, now: NOW });
        const consumed = consumeAutomaticMissionSetGrant(mission, grant, NOW + 1);
        assert.equal(consumed.status, 'CONSUMED');
        assert.throws(
            () => consumeAutomaticMissionSetGrant(mission, consumed, NOW + 2),
            /automatic_mission_grant_replayed/,
        );
        const { grant: revocable } = bindAutomaticMissionAuthority({ mission, now: NOW });
        const revoked = revokeAutomaticMissionSetGrant(revocable, 'operator stop', NOW + 2);
        assert.throws(
            () => verifyAutomaticMissionSetGrant(mission, revoked, NOW + 3),
            /automatic_mission_authority_revoked/,
        );
        assert.throws(
            () => verifyAutomaticMissionSetGrant(
                { ...mission, mission_id: `${mission.mission_id}:other` }, grant, NOW + 1,
            ),
            /automatic_mission_grant_scope_mismatch/,
        );
        assert.throws(
            () => bindAutomaticMissionAuthority({ mission, now: DESIGN.expires_at! + 1 }),
            /automatic_mission_authority_expired/,
        );
    });
});
