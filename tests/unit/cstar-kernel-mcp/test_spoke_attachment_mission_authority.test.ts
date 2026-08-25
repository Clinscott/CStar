import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { AutomaticMissionDesign } from '../../../src/types/automatic_mission.js';
import {
    bindAutomaticMissionAuthority,
    buildAutomaticMissionInstructionText,
} from '../../../src/tools/pennyone/intel/automatic_mission_authority.js';
import { createAutomaticMissionRecord } from '../../../src/tools/pennyone/intel/automatic_mission_controller.js';
import { stableAutomaticMissionJson } from '../../../src/tools/pennyone/intel/automatic_mission_schema.js';
import {
    canonicalMissionDispatchReceiptSha256,
    isCurrentMissionAttachmentRevocation,
    verifyPersistedMissionAttachmentParent,
} from '../../../src/tools/pennyone/intel/spoke_attachment_mission_grant_controller.js';

const NOW = 1_800_000_000_000;

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

function failureCode(action: () => unknown): string {
    try {
        action();
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error('expected_failure');
}

function makeRepository(): string {
    const root = fs.mkdtempSync(path.join('/home/morderith/Corvus', 'cstar-mission-parent-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic mission fixture.\n', { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
    return root;
}

function fixture(root: string, targets: string[] = [root]) {
    const design: AutomaticMissionDesign = {
        description: 'Bounded spoke attachment parent.',
        root_task: 'task:cstar:spoke-attachment',
        targets,
        outputs: ['hall-attachment-receipt'],
        prohibitions: ['git_push', 'deploy', 'provider_launch'],
        retry_ceiling: 0,
        attempt_ceiling: 1,
        spend_ceiling: 0,
        expires_at: NOW + 60_000,
        adapter: null,
        callback: null,
        validator: null,
    };
    const draft = createAutomaticMissionRecord({
        objective: 'Attach one exact Corvus spoke through Hall.',
        design,
    }, NOW);
    const threadId = 'thread:mission-root';
    const turnId = 'turn:mission-root';
    const mission = createAutomaticMissionRecord({
        objective: draft.objective,
        design,
        root_user_record: {
            thread_id: threadId,
            turn_id: turnId,
            timestamp: new Date(NOW).toISOString(),
            text: buildAutomaticMissionInstructionText(draft, 'mission'),
        },
    }, NOW);
    const { grant } = bindAutomaticMissionAuthority({ mission, now: NOW });
    const slug = path.basename(root).toLowerCase();
    const missionJson = stableAutomaticMissionJson(mission);
    const dispatchMaterial = {
        schema: 'cstar.mission_dispatch_receipt.v1',
        state: 'queued',
        mission_id: mission.mission_id,
        slug,
        receipt_id: 'dispatch-receipt:attachment-fixture',
        mission_json: missionJson,
        mission_json_sha256: sha256(missionJson),
        thread_id: threadId,
        deadline_at: NOW + 30_000,
    };
    const dispatch = {
        ...dispatchMaterial,
        receipt_sha256: canonicalMissionDispatchReceiptSha256(dispatchMaterial),
    };
    const grantJson = stableAutomaticMissionJson(grant);
    const row = {
        request_status: 'AUTHORIZED',
        request_expires_at: NOW + 50_000,
        request_summary_json: stableAutomaticMissionJson({ mission, dispatch_receipt: dispatch }),
        grant_schema: grant.schema,
        grant_sha256: sha256(grantJson),
        grant_json: grantJson,
        grant_expires_at: grant.expires_at,
    };
    return { mission, grant, dispatch, row, slug, threadId, turnId };
}

function verify(root: string, value: ReturnType<typeof fixture>) {
    return verifyPersistedMissionAttachmentParent({
        row: value.row,
        mission_id: value.mission.mission_id,
        grant_id: value.grant.grant_id,
        slug: value.slug,
        root_path: root,
        now: NOW + 1,
    });
}

describe('CStar spoke attachment durable mission parent', () => {
    it('treats only current explicit deny, pause, revoke, or hold text as revocation evidence', () => {
        for (const text of [
            'Stop.', 'Pause!', 'Never mind?', 'Deny.', 'Denied!', 'Hold.',
            'Hold on!', 'Put this on hold.', 'Revoke this.', 'Do not continue.',
            'I revoke the attachment authority.',
        ]) {
            assert.equal(isCurrentMissionAttachmentRevocation(text), true, text);
        }
        assert.equal(isCurrentMissionAttachmentRevocation('Historical status is informational.'), false);
        assert.equal(isCurrentMissionAttachmentRevocation('Pause the music player.'), false);
    });

    it('accepts one exact canonical mission, SET grant, and dispatch receipt', () => {
        const root = makeRepository();
        try {
            const value = fixture(root);
            const result = verify(root, value);
            assert.deepEqual(result, {
                mission_id: value.mission.mission_id,
                grant_id: value.grant.grant_id,
                thread_id: value.threadId,
                turn_id: value.turnId,
                record_sha256: value.grant.root_user_record_sha256,
                record_set_sha256: value.grant.root_user_record_set_sha256,
                record_count: value.grant.root_user_record_count,
                selected_record_index: value.grant.selected_root_user_record_index,
                grant_expires_at: value.grant.expires_at,
                dispatch_deadline_at: NOW + 30_000,
                dispatch_state: 'queued',
                dispatch_receipt_id: value.dispatch.receipt_id,
                dispatch_receipt_sha256: value.dispatch.receipt_sha256,
                slug: value.slug,
            });
            assert.equal('spend_ceiling' in result, false);
            assert.equal('adapter' in result, false);
            assert.equal('callback' in result, false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('recomputes the canonical dispatch receipt hash', () => {
        const root = makeRepository();
        try {
            const value = fixture(root);
            const badDispatch = { ...value.dispatch, receipt_sha256: 'f'.repeat(64) };
            const bad = {
                ...value,
                row: {
                    ...value.row,
                    request_summary_json: stableAutomaticMissionJson({
                        mission: value.mission,
                        dispatch_receipt: badDispatch,
                    }),
                },
            };
            assert.equal(
                failureCode(() => verify(root, bad)),
                'spoke_attachment_mission_dispatch_receipt_invalid',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects duplicate keys in grants, summaries, and embedded mission JSON', () => {
        const root = makeRepository();
        try {
            const value = fixture(root);
            const duplicateGrantJson = value.row.grant_json.replace(
                '"grant_id":',
                '"grant_id":"shadow","grant_id":',
            );
            assert.equal(failureCode(() => verify(root, {
                ...value,
                row: { ...value.row, grant_json: duplicateGrantJson, grant_sha256: sha256(duplicateGrantJson) },
            })), 'spoke_attachment_mission_grant_invalid');

            const duplicateSummary = `{"mission":${stableAutomaticMissionJson(value.mission)},`
                + `"mission":${stableAutomaticMissionJson(value.mission)},`
                + `"dispatch_receipt":${stableAutomaticMissionJson(value.dispatch)}}`;
            assert.equal(failureCode(() => verify(root, {
                ...value,
                row: { ...value.row, request_summary_json: duplicateSummary },
            })), 'spoke_attachment_mission_json_invalid');

            const duplicateMissionJson = value.dispatch.mission_json.replace(
                '"schema":',
                '"schema":"shadow","schema":',
            );
            const dispatchMaterial = {
                ...value.dispatch,
                mission_json: duplicateMissionJson,
                mission_json_sha256: sha256(duplicateMissionJson),
            };
            const { receipt_sha256: _oldHash, ...withoutHash } = dispatchMaterial;
            const duplicateDispatch = {
                ...withoutHash,
                receipt_sha256: canonicalMissionDispatchReceiptSha256(withoutHash),
            };
            assert.equal(failureCode(() => verify(root, {
                ...value,
                row: {
                    ...value.row,
                    request_summary_json: stableAutomaticMissionJson({
                        mission: value.mission,
                        dispatch_receipt: duplicateDispatch,
                    }),
                },
            })), 'spoke_attachment_mission_dispatch_receipt_invalid');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects incomplete targets, slug drift, revoked state, and incompatible legacy parents', () => {
        const root = makeRepository();
        try {
            const multiple = fixture(root, [root, path.join(root, 'child')]);
            assert.equal(
                failureCode(() => verify(root, multiple)),
                'spoke_attachment_mission_target_not_exact',
            );
            const value = fixture(root);
            assert.equal(failureCode(() => verifyPersistedMissionAttachmentParent({
                row: value.row,
                mission_id: value.mission.mission_id,
                grant_id: value.grant.grant_id,
                slug: 'wrong-slug',
                root_path: root,
                now: NOW + 1,
            })), 'spoke_attachment_mission_slug_not_exact');
            assert.equal(failureCode(() => verify(root, {
                ...value,
                row: { ...value.row, request_status: 'HELD' },
            })), 'spoke_attachment_mission_parent_revoked');
            assert.equal(failureCode(() => verifyPersistedMissionAttachmentParent({
                row: {
                    request_status: 'AUTHORIZED',
                    request_summary_json: '{}',
                    grant_schema: 'cstar.mission_set_grant.v1',
                    grant_sha256: 'a'.repeat(64),
                    grant_json: '{}',
                },
                mission_id: 'mission:legacy',
                grant_id: 'grant:legacy',
                slug: value.slug,
                root_path: root,
                now: NOW + 1,
            })), 'spoke_attachment_mission_parent_incompatible');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
