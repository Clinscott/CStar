import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';

import { selectCouncilExpert } from '../../../src/core/council_experts.js';
import {
    canonicalAuguryMissionReceiptJson,
    type AuguryMissionBoundaryInput,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { handleAugury } from '../../../src/tools/cstar-kernel-mcp/tools/augury.js';
import {
    finalizeAuguryMissionBoundary,
    prepareAuguryMissionBoundary,
} from '../../../src/tools/cstar-kernel-mcp/tools/augury_mission_binding.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    cleanupOperatorAuthorizationFixtures,
    createSession,
    validRequestContext,
} from './operator_authorization_test_support.js';

const originalRoot = registry.getRoot();
const roots: string[] = [];
const GOLDEN_ROOT = '/tmp/cstar-augury-mission-golden-v2';
const GOLDEN_TIMESTAMP = '2026-07-30T12:00:00.000Z';
const GOLDEN_NOW = Date.parse(GOLDEN_TIMESTAMP) + 1_000;
const GOLDEN_PAYLOAD_SHA256 = '7e5a3dadb09687e86975c243537d66abb0c2ffe1e8e646b3141dbb69fb9793ae';
const GOLDEN_RECEIPT_ID = 'augury-mission:c6ea0dd723c0aee3133e7fc6f6eaf16ff638002873f8ab841f898f0863f7f5d6';
const GOLDEN_ORDERED_PLAN_SHA256 = '52c911ef2ffdabf90a1c19750d2a00127b6181e8150a4be43747c73d8d4746d1';
const GOLDEN_RECEIPT_BASE64 = 'eyJhdXRob3JpdHlfZWZmZWN0IjoicmVhZF9wcm9qZWN0aW9uX29ubHkiLCJiZWFkX3BsYW4iOlt7ImFjY2VwdGFuY2Vfb2JsaWdhdGlvbnMiOlsiR29sZGVuIHJlY2VpcHQgaXMgYnl0ZS1zdGFibGUuIl0sImJlYWRfaWQiOiJiZWFkOmNzdGFyOmdvbGRlbi1jb250cmFjdCIsImNoZWNrZXJfb2JsaWdhdGlvbnMiOlsibm9kZSAtLXRlc3QgZ29sZGVuIl0sImRlcGVuZGVuY2llcyI6W10sImxhbmUiOiJmb3JnZSIsIm9yZGVyIjowLCJ0YXJnZXRfcGF0aHMiOlsic3JjL0ZpbGUudHMiXX1dLCJib3VuZGFyeV9raW5kIjoibmV3X2N1cnJlbnRfZXhhY3Rfc2V0X2Rlc2lnbl9ib3VuZGFyeSIsImNhbm9uaWNhbF9wYXlsb2FkX3NoYTI1NiI6IjdlNWEzZGFkYjA5Njg3ZTg2OTc1YzI0MzUzN2Q2NmFiYjBjMmZmZTFlOGU2NDZiMzE0MWRiYjY5ZmI5NzkzYWUiLCJjb250YWluZWRfdGFyZ2V0X3BhdGhzIjpbInNyYy9GaWxlLnRzIl0sImNvdW5jaWwiOnsiY2FuZGlkYXRlcyI6W3siaWQiOiJzYWthZ3VjaGkiLCJsYWJlbCI6IlNBS0FHVUNISSIsInJlYXNvbiI6InNvZnQgZGVmYXVsdCBmb3IgYnVpbGQg4oCUIHZpc2lvbmFyeSBhcmNoaXRlY3R1cmU7IHNwZWNpYWxpc3RzIG92ZXJyaWRlIiwic2NvcmUiOjZ9XSwiZXhwZXJ0Ijp7ImlkIjoic2FrYWd1Y2hpIiwibGFiZWwiOiJTQUtBR1VDSEkiLCJsZW5zIjoiQXR0YWNrIHNoYWxsb3cgYXJjaGl0ZWN0dXJlLCBtaXNzaW5nIG5hcnJhdGl2ZSBjb2hlcmVuY2UsIGRpc2Nvbm5lY3RlZCBzeXN0ZW1zLCBhbmQgZW1vdGlvbmFsL3N5c3RlbWljIG1pc2FsaWdubWVudC4iLCJzaWduYXR1cmVfcXVlc3Rpb24iOiJXaGF0IGlzIHRoZSBtYXN0ZXIgbmFycmF0aXZlIHRoaXMgc3Vic3lzdGVtIGlzIHNlcnZpbmcsIGFuZCBkb2VzIGFueW9uZSBvdXRzaWRlIHRoZSBhdXRob3IgdW5kZXJzdGFuZCB3aHkgaXQgZXhpc3RzPyJ9LCJndWFyZHJhaWxzIjpbIkRvIG5vdCBhY2NlcHQgc3lzdGVtcyB3aXRob3V0IGEgY2xlYXIgZnVuY3Rpb25hbCBcIndoeVwiIG9yIG5hcnJhdGl2ZSBhbmNob3IuIiwiRG8gbm90IGRlc2lnbiBkZWVwIGNvbXBsZXhpdHkgdGhhdCBmYWlscyB0byByZXNvbmF0ZSB3aXRoIHRoZSBvdmVyYWxsIHByb2plY3QgaW50ZW50LiIsIkRvIG5vdCBpZ25vcmUgdGhlIGVtb3Rpb25hbCBvciBjaW5lbWF0aWMgcXVhbGl0eSBvZiB0aGUgdGVjaG5pY2FsIHNvbHV0aW9uLiJdLCJpbnRlbnRfY2F0ZWdvcnkiOiJCVUlMRCIsInNlbGVjdGlvbl9uYW1lIjoiY3N0YXIta2VybmVsIiwic2VsZWN0aW9uX3RpZXIiOiJTS0lMTCJ9LCJjb3VudHMiOnsiYWNjZXB0YW5jZV9vYmxpZ2F0aW9uX2NvdW50IjoxLCJiZWFkX2NvdW50IjoxLCJjaGVja2VyX29ibGlnYXRpb25fY291bnQiOjEsImRlcGVuZGVuY3lfY291bnQiOjAsInRhcmdldF9jb3VudCI6MX0sImRlc2lnbiI6eyJyZXZpc2lvbiI6MSwic2hhMjU2IjoiY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjYyJ9LCJtaXNzaW9uX2RlY2lzaW9uX2lkIjoiZGVjaXNpb246Y3N0YXI6Z29sZGVuLWJvdW5kYXJ5Iiwib3JkZXJlZF9wbGFuX2NvdW50IjoxLCJvcmRlcmVkX3BsYW5fc2hhMjU2IjoiNTJjOTExZWYyZmZkYWJmOTBhMWMxOTc1MGQyYTAwMTI3YjYxODFlODE1MGE0YmU0Mzc0N2M3M2Q4ZDQ3NDZkMSIsInByb3Bvc2VkX3BhcmVudF9iZWFkX2lkIjoiYmVhZDpjc3Rhcjpnb2xkZW4tcGFyZW50IiwicmVjZWlwdF9pZCI6ImF1Z3VyeS1taXNzaW9uOmM2ZWEwZGQ3MjNjMGFlZTMxMzNlN2ZjNmY2ZWFmMTZmZjYzODAwMjg3M2Y4YWI4NDFmODk4ZjA4NjNmN2Y1ZDYiLCJyZXBvc2l0b3J5Ijp7ImlkZW50aXR5X3NoYTI1NiI6IjVhMTg2MGEwN2FiNzQ4MWQxMTVlNDY4MDAwYWViZGJlZjFiNGYyNmIxNWY4Njg4NGQyODg2M2VkNTU1YTQwODgiLCJyZXBvc2l0b3J5X2lkIjoicmVwbzpjc3RhcjpzeW50aGV0aWMiLCJyb290X3BhdGgiOiIvdG1wL2NzdGFyLWF1Z3VyeS1taXNzaW9uLWdvbGRlbi12MiIsInNjaGVtYSI6ImNzdGFyLnJlcG9zaXRvcnlfcm9vdF9pZGVudGl0eS52MSJ9LCJzY2hlbWEiOiJjc3Rhci5hdWd1cnlfbWlzc2lvbl9yZWNlaXB0LnYxIiwic2NvcGUiOnsiZG9tYWluIjoiYnJhaW4iLCJzY2hlbWEiOiJjc3Rhci5taXNzaW9uX3Njb3BlLnYxIiwic2NvcGVfaWQiOiJicmFpbjpDU3RhciIsInN1YmplY3QiOiJDU3RhciJ9LCJzZXRfaWRlbnRpdHkiOnsicm9vdF90aHJlYWRfaWQiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEiLCJzY2hlbWEiOiJjc3Rhci52ZXJpZmllZF9jdXJyZW50X2V4YWN0X3Jvb3Rfc2V0LnYxIiwic2Vzc2lvbl9yZWNvcmRfY291bnQiOjIsInNlc3Npb25fcmVjb3JkX3NldF9zaGEyNTYiOiI2MjkxMjQxZTAxZDUzNDU2YzA1YTE5MDQ2ZGUyNDQxODg4NTU1YjA2ZDI0NDcwZjkxOGYyMjg2MzM1M2Y4ZWNmIiwic2V0X2ZpcnN0X3RpbWVzdGFtcCI6IjIwMjYtMDctMzBUMTI6MDA6MDAuMDAwWiIsInNldF9yZWNvcmRfY291bnQiOjEsInNldF9yZWNvcmRfc2V0X3NoYTI1NiI6ImYxODYwYzFkMmVlMzU4OGFjMTcyMDE2OGQwYWRhOGEyYjI4N2ViMDRlNzk3OWE5OTk3MmM0YjdhY2IxNjZkMDgiLCJzZXRfcmVjb3JkX3NoYTI1NiI6IjRkYzcwZjQ1MzgyNGEwYjU3OTljNTZiMTc2NjQwMTBiMDkwNWVmYWE5ZWU2MGI5MTAxYzQ1OWM5YmMwMWJjM2QiLCJzZXRfdGltZXN0YW1wIjoiMjAyNi0wNy0zMFQxMjowMDowMC4wMDBaIiwic2V0X3R1cm5faWQiOiIyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0yMjIyMjIyMjIyMjIiLCJzb3VyY2UiOiJ2ZXJpZmllZF9jb2RleF9yZXF1ZXN0X2lkZW50aXR5In0sInZlcnNpb24iOjF9';
const GOLDEN_RECEIPT_BYTES = Buffer.from(GOLDEN_RECEIPT_BASE64, 'base64').toString('utf-8');

afterEach(() => {
    registry.setRoot(originalRoot);
    mock.restoreAll();
    cleanupOperatorAuthorizationFixtures();
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
    fs.rmSync(GOLDEN_ROOT, { recursive: true, force: true });
});

function rootFixture(prefix = 'cstar-augury-mission-'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src', 'Exact'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'Exact', 'File.ts'), 'export {};\n');
    fs.writeFileSync(path.join(root, 'tests', 'mission.test.ts'), 'export {};\n');
    registry.setRoot(root);
    return root;
}

function boundary(root: string): AuguryMissionBoundaryInput {
    return {
        schema: 'cstar.augury_mission_boundary.v1',
        repository: {
            schema: 'cstar.repository_root_identity.v1',
            repository_id: 'repo:cstar:synthetic',
            root_path: root,
        },
        mission_decision_id: 'decision:cstar:synthetic-boundary',
        proposed_parent_bead_id: 'bead:cstar:synthetic-parent',
        design: { revision: 3, sha256: 'c'.repeat(64) },
        scope: { schema: 'cstar.mission_scope.v1', domain: 'brain', subject: 'CStar' },
        contained_target_paths: ['tests/mission.test.ts', 'src/Exact/File.ts'],
        bead_plan: [
            {
                bead_id: 'bead:cstar:synthetic-contract',
                dependencies: [],
                lane: 'forge',
                target_paths: ['src/Exact/File.ts'],
                acceptance_obligations: ['Receipt bytes are deterministic.'],
                checker_obligations: ['node --test synthetic-contract'],
            },
            {
                bead_id: 'bead:cstar:synthetic-validation',
                dependencies: ['bead:cstar:synthetic-contract'],
                lane: 'corvus_eye',
                target_paths: ['tests/mission.test.ts'],
                acceptance_obligations: ['Replay drift fails closed.'],
                checker_obligations: ['node --test synthetic-validation'],
            },
        ],
    };
}

function route(targets: string[], intent = 'build exact mission receipt') {
    const selected = selectCouncilExpert({
        intent_category: 'BUILD',
        intent,
        selection_tier: 'SKILL',
        selection_name: 'cstar-kernel',
        mimirs_well: targets.slice(0, 3),
    });
    return {
        intent_category: 'BUILD',
        intent,
        selection: 'SKILL: cstar-kernel',
        expert: selected.id,
        expert_label: selected.label,
        expert_lens: selected.lens,
        expert_signature_question: selected.signature_question,
        expert_guardrails: selected.anti_behavior.slice(0, 3),
        council_candidates: selected.selection_candidates,
        mimir_targets: targets.slice(0, 3),
    };
}

function setSession(options: Parameters<typeof createSession>[0] = {}) {
    return createSession({ textParts: ['SET'], ...options });
}

async function prepare(
    value: AuguryMissionBoundaryInput,
    root: string,
    session = setSession(),
    options: { topTargets?: string[]; topScope?: string; now?: number } = {},
) {
    return prepareAuguryMissionBoundary({
        boundary: value,
        expected_root: root,
        request_context: validRequestContext(session.threadId, session.turnId),
        top_level_target_paths: options.topTargets,
        top_level_scope: options.topScope,
        now: options.now,
    });
}

async function receipt(
    value: AuguryMissionBoundaryInput,
    root: string,
    session = setSession(),
    now?: number,
) {
    const prepared = await prepare(value, root, session, { now });
    return finalizeAuguryMissionBoundary({
        prepared,
        route: route([...prepared.target_paths]),
    });
}

function replay(value: AuguryMissionBoundaryInput, prior: Awaited<ReturnType<typeof receipt>>) {
    value.replay = {
        canonical_payload_sha256: prior.canonical_payload_sha256,
        receipt_id: prior.receipt_id,
        ordered_plan_count: prior.ordered_plan_count,
        ordered_plan_sha256: prior.ordered_plan_sha256,
    };
}

describe('adversarial Augury SET mission-boundary receipt', () => {
    it('requires an opaque supported-verifier result and emits canonical plan identity', async () => {
        const root = rootFixture();
        const result = await receipt(boundary(root), root);
        assert.deepEqual(result.contained_target_paths, [
            'src/Exact/File.ts', 'tests/mission.test.ts',
        ]);
        assert.equal(result.set_identity.source, 'verified_codex_request_identity');
        assert.equal(result.set_identity.set_record_count, 1);
        assert.equal(result.ordered_plan_count, 2);
        assert.match(result.ordered_plan_sha256, /^[a-f0-9]{64}$/);
        assert.throws(() => finalizeAuguryMissionBoundary({
            prepared: { target_paths: [], scope_id: 'brain:CStar' },
            route: route(['src/Exact/File.ts']),
        }), { message: 'augury_mission_verified_set_required' });

        const forged = boundary(root) as AuguryMissionBoundaryInput & { set_identity: object };
        forged.set_identity = { root_thread_id: 'arbitrary' };
        await assert.rejects(prepare(forged, root), {
            message: 'augury_mission_boundary_incomplete',
        });
    });

    it('uses realpath containment, rejects /var/run-style escape and case drift', async () => {
        const root = rootFixture();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-augury-outside-'));
        roots.push(outside);
        fs.mkdirSync(path.join(root, 'var'), { recursive: true });
        fs.writeFileSync(path.join(outside, 'socket'), 'outside\n');
        fs.symlinkSync(outside, path.join(root, 'var', 'run'), 'dir');

        const escaped = boundary(root);
        escaped.contained_target_paths = ['var/run/socket'];
        escaped.bead_plan = [{
            ...escaped.bead_plan[0]!,
            target_paths: ['var/run/socket'],
        }];
        await assert.rejects(prepare(escaped, root), {
            message: 'augury_mission_target_symlink_escape',
        });

        const wrongCase = boundary(root);
        wrongCase.contained_target_paths[1] = 'src/exact/File.ts';
        wrongCase.bead_plan[0]!.target_paths[0] = 'src/exact/File.ts';
        await assert.rejects(prepare(wrongCase, root), {
            message: 'augury_mission_target_case_drift',
        });
    });

    it('allows nonexistent finals under exact canonical ancestors and resolves inside aliases', async () => {
        const root = rootFixture();
        fs.symlinkSync(path.join(root, 'src', 'Exact'), path.join(root, 'inside-alias'), 'dir');
        const value = boundary(root);
        value.contained_target_paths = ['src/Exact/New/Deep.ts', 'inside-alias/File.ts'];
        value.bead_plan[0]!.target_paths = ['inside-alias/File.ts'];
        value.bead_plan[1]!.target_paths = ['src/Exact/New/Deep.ts'];
        const prepared = await prepare(value, root);
        assert.deepEqual(prepared.target_paths, [
            'src/Exact/File.ts', 'src/Exact/New/Deep.ts',
        ]);
    });

    it('accepts canonical-equivalent target order and rejects top-level mismatch', async () => {
        const root = rootFixture();
        const value = boundary(root);
        await prepare(value, root, setSession(), {
            topTargets: ['src/Exact/File.ts', path.join(root, 'tests', 'mission.test.ts')],
            topScope: 'brain:CStar',
        });
        await assert.rejects(prepare(value, root, setSession(), {
            topTargets: ['src/Exact/File.ts'],
        }), { message: 'augury_mission_target_set_mismatch' });
    });

    it('rejects nested, duplicate, suffix, quote, question, conditional, and revocation SETs', async () => {
        const root = rootFixture();
        const nested = setSession({
            sessionMeta: { parent_thread_id: '11111111-1111-4111-8111-111111111111' },
        });
        await assert.rejects(prepare(boundary(root), root, nested), {
            message: 'augury_mission_request_identity_invalid',
        });
        await assert.rejects(prepare(boundary(root), root, setSession({ duplicate: true })), {
            message: 'augury_mission_set_signal_ambiguous',
        });
        for (const text of [
            'SET now', '"SET"', 'SET?', 'SET if validation passes',
            'The report says SET.', 'Maybe SET', 'Do not SET', 'Example: SET',
        ]) {
            await assert.rejects(prepare(
                boundary(root), root, createSession({ textParts: [text] }),
            ), { message: 'augury_mission_set_signal_missing' });
        }
        await assert.rejects(prepare(
            boundary(root), root, setSession({ laterUserText: 'Stop.' }),
        ), { message: 'augury_mission_set_identity_drift' });
    });

    it('enforces structured scope, strict ids, finite lanes, prior dependencies, and ownership', async () => {
        const root = rootFixture();
        const invalidScope = boundary(root);
        invalidScope.scope = 'brain:CStar if approved?' as never;
        await assert.rejects(prepare(invalidScope, root), {
            message: 'augury_mission_scope_invalid',
        });
        for (const mutate of [
            (value: AuguryMissionBoundaryInput) => {
                value.mission_decision_id = 'decision:cstar:ok suffix';
            },
            (value: AuguryMissionBoundaryInput) => {
                value.bead_plan[0]!.lane = 'operator' as never;
            },
            (value: AuguryMissionBoundaryInput) => {
                value.bead_plan[0]!.dependencies = ['bead:cstar:synthetic-validation'];
            },
            (value: AuguryMissionBoundaryInput) => {
                value.bead_plan[1]!.bead_id = value.bead_plan[0]!.bead_id;
            },
            (value: AuguryMissionBoundaryInput) => {
                value.bead_plan[1]!.target_paths = ['src/Exact/File.ts'];
            },
        ]) {
            const value = boundary(root);
            mutate(value);
            await assert.rejects(prepare(value, root));
        }
    });

    it('accepts the proposed parent as the only external plan dependency', async () => {
        const root = rootFixture();
        const value = boundary(root);
        value.bead_plan[0]!.dependencies = [value.proposed_parent_bead_id];
        const result = await receipt(value, root);
        assert.deepEqual(result.bead_plan[0]!.dependencies, [
            'bead:cstar:synthetic-parent',
        ]);
    });

    it('rejects a planned child bead id that collides with the proposed parent', async () => {
        const root = rootFixture();
        const value = boundary(root);
        value.bead_plan[0]!.bead_id = value.proposed_parent_bead_id;
        await assert.rejects(prepare(value, root), {
            message: 'augury_mission_plan_id_invalid',
        });
    });

    it('rejects noncanonical or duplicate Council candidates', async () => {
        const root = rootFixture();
        const first = await prepare(boundary(root), root);
        const reversed = route([...first.target_paths], 'build augury trace contract');
        reversed.council_candidates = [...(reversed.council_candidates ?? [])].reverse();
        assert.throws(() => finalizeAuguryMissionBoundary({
            prepared: first, route: reversed,
        }), { message: 'augury_mission_council_order_invalid' });

        const second = await prepare(boundary(root), root);
        const duplicated = route([...second.target_paths], 'build augury trace contract');
        duplicated.council_candidates = [
            duplicated.council_candidates![0]!,
            duplicated.council_candidates![0]!,
        ];
        assert.throws(() => finalizeAuguryMissionBoundary({
            prepared: second, route: duplicated,
        }), { message: 'augury_mission_council_order_invalid' });
    });

    it('binds replay to SET, scope, targets, design, and independent ordered plan', async () => {
        const root = rootFixture();
        const session = setSession();
        const original = await receipt(boundary(root), root, session);
        const exact = boundary(root);
        replay(exact, original);
        assert.equal(
            canonicalAuguryMissionReceiptJson(await receipt(exact, root, session)),
            canonicalAuguryMissionReceiptJson(original),
        );
        const mutations: Array<(value: AuguryMissionBoundaryInput) => void> = [
            (value) => { value.design.sha256 = 'd'.repeat(64); },
            (value) => { value.scope = { schema: 'cstar.mission_scope.v1', domain: 'estate', subject: 'Corvus' }; },
            (value) => {
                value.contained_target_paths[0] = 'tests/changed.test.ts';
                value.bead_plan[1]!.target_paths[0] = 'tests/changed.test.ts';
            },
            (value) => { value.bead_plan[0]!.acceptance_obligations[0] = 'Changed.'; },
        ];
        for (const mutate of mutations) {
            const value = boundary(root);
            replay(value, original);
            mutate(value);
            await assert.rejects(receipt(value, root, session), {
                message: 'augury_mission_replay_mismatch',
            });
        }
        const changedSet = boundary(root);
        replay(changedSet, original);
        await assert.rejects(receipt(
            changedSet,
            root,
            setSession({ textParts: ['set'] }),
        ), { message: 'augury_mission_replay_mismatch' });
    });

    it('uses mission targets for a real available stale-session blocker', async () => {
        const root = rootFixture();
        const session = setSession();
        const active = {
            session_id: 'planning:stale',
            repo_id: 'repo:stale',
            skill_id: 'cstar-kernel',
            status: 'PLAN_READY',
            user_intent: 'continue active session',
            normalized_intent: 'continue active session',
            created_at: 1,
            updated_at: 2,
            metadata: { augury_contract: {
                intent_category: 'ORCHESTRATE',
                intent: 'continue active session',
                selection_tier: 'SKILL',
                selection_name: 'cstar-kernel',
                mimirs_well: ['legacy/old.ts'],
            } },
        };
        mock.method(database, 'listHallPlanningSessions', () => [active] as never);
        mock.method(database, 'getHallPlanningSession', () => active as never);
        const response = await handleAugury({
            prompt: 'Use the active session for this continuation.',
            mission_boundary: boundary(root),
        }, validRequestContext(session.threadId, session.turnId));
        const payload = JSON.parse(response.content[0]!.text);
        assert.equal(payload.stale_session_divergence_blocker, true);
        assert.equal(payload.mission_boundary_receipt, undefined);
        assert.deepEqual(payload.current_mission_route.target_paths, [
            'src/Exact/File.ts', 'tests/mission.test.ts',
        ]);
    });

    it('keeps legacy manifest replay and closeout advisory calls context-free', async () => {
        const root = rootFixture();
        mock.method(database, 'listHallPlanningSessions', () => []);
        for (const prompt of [
            'replay the existing active legacy manifest',
            'close out the existing active legacy manifest',
        ]) {
            const response = await handleAugury({ prompt });
            const payload = JSON.parse(response.content[0]!.text);
            assert.equal(response.isError, undefined);
            assert.equal(payload.mission_boundary_receipt, undefined);
        }
        assert.ok(fs.existsSync(root));
    });

    it('matches the hard-coded canonical golden receipt', async () => {
        fs.rmSync(GOLDEN_ROOT, { recursive: true, force: true });
        fs.mkdirSync(path.join(GOLDEN_ROOT, 'src'), { recursive: true });
        fs.writeFileSync(path.join(GOLDEN_ROOT, 'src', 'File.ts'), 'export {};\n');
        registry.setRoot(GOLDEN_ROOT);
        const value = boundary(GOLDEN_ROOT);
        value.contained_target_paths = ['src/File.ts'];
        value.bead_plan = [{
            bead_id: 'bead:cstar:golden-contract',
            dependencies: [],
            lane: 'forge',
            target_paths: ['src/File.ts'],
            acceptance_obligations: ['Golden receipt is byte-stable.'],
            checker_obligations: ['node --test golden'],
        }];
        value.mission_decision_id = 'decision:cstar:golden-boundary';
        value.proposed_parent_bead_id = 'bead:cstar:golden-parent';
        value.design = { revision: 1, sha256: 'c'.repeat(64) };
        const session = setSession({
            threadId: '11111111-1111-4111-8111-111111111111',
            turnId: '22222222-2222-4222-8222-222222222222',
            timestamp: GOLDEN_TIMESTAMP,
        });
        const result = await receipt(value, GOLDEN_ROOT, session, GOLDEN_NOW);
        const bytes = canonicalAuguryMissionReceiptJson(result);
        assert.equal(result.canonical_payload_sha256, GOLDEN_PAYLOAD_SHA256);
        assert.equal(result.receipt_id, GOLDEN_RECEIPT_ID);
        assert.equal(result.ordered_plan_sha256, GOLDEN_ORDERED_PLAN_SHA256);
        assert.equal(bytes, GOLDEN_RECEIPT_BYTES);
    });
});
