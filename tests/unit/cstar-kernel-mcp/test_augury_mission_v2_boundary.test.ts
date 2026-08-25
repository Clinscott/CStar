import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, it } from 'node:test';

import {
    canonicalAuguryMissionReceiptJson,
    hashAuguryMissionValue,
    stableAuguryMissionJson,
    type AuguryMissionBoundaryInput,
    type AuguryMissionBoundaryInputV2,
} from '../../../src/tools/cstar-kernel-mcp/contracts/augury_mission.js';
import { hashOrderedForgeChildRequestTemplates } from
    '../../../src/tools/cstar-kernel-mcp/contracts/forge_child_request_template.js';
import { prepareAuguryMissionBoundary } from
    '../../../src/tools/cstar-kernel-mcp/tools/augury_mission_binding.js';
import {
    cleanupOperatorAuthorizationFixtures,
    validRequestContext,
} from './operator_authorization_test_support.js';
import {
    bindV2Replay,
    cleanupV2Roots,
    cloneV2,
    createFixedV2Root,
    createV2Receipt,
    createV2Root,
    responseOnlyTemplate,
    setSession,
    templateBinding,
    v2Boundary,
} from './augury_mission_v2_test_support.js';

const GOLDEN_ROOT = '/tmp/cstar-augury-mission-v2-golden';
const GOLDEN_PAYLOAD_SHA256 = '887e13246df5cdc9fa3f41fdee31cf5d3163d4e738d1835b925611623d34b740';
const GOLDEN_RECEIPT_ID = 'augury-mission:e3c7afd65e594eccc1b0695659fef3f110b504d1e4902edb110fc7eb25b6f9be';
const GOLDEN_ORDERED_PLAN_SHA256 = '7b3aa4288579e726752c977095f17b4d12f82231d55c182039ec6f3529b07f0e';
const GOLDEN_ORDERED_TEMPLATES_SHA256 = '92f88430b9d5a37a068891f6a26f5156304015f52035ca990a9df5db63166800';
const GOLDEN_TEMPLATE_BINDINGS = [
    { sha256: '10c4940e6f59cd57f0f84779dd8bd94cb40b6ada200e9e8534271ed112b3d7f4', bytes: 623 },
    { sha256: '63eb5ff436f0548059ab8edb5c778b717a0e87b04ece1fad96d0f5dbab53d065', bytes: 663 },
] as const;
const GOLDEN_RECEIPT_GZIP_BASE64 = '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';

afterEach(() => {
    cleanupV2Roots();
    cleanupOperatorAuthorizationFixtures();
});

function makeTwoForge(boundary: AuguryMissionBoundaryInputV2): void {
    const secondTemplate = responseOnlyTemplate({
        objective: 'Implement the second exact Forge child.',
        prompt: 'Preserve ordered template identity.',
    });
    boundary.bead_plan[1] = {
        ...boundary.bead_plan[1]!,
        lane: 'forge',
        ...templateBinding(secondTemplate),
    };
}

async function prepare(value: AuguryMissionBoundaryInputV2, root: string) {
    const session = setSession();
    return prepareAuguryMissionBoundary({
        boundary: value,
        expected_root: root,
        request_context: validRequestContext(session.threadId, session.turnId),
        now: Date.parse(session.timestamp) + 1_000,
    });
}

describe('Augury mission boundary v2 template binding', () => {
    it('requires explicit v2 schema/version and never reinterprets v1', async () => {
        const root = createV2Root();
        const missingVersion = cloneV2(v2Boundary(root)) as any;
        delete missingVersion.version;
        await assert.rejects(prepare(missingVersion, root),
            /augury_mission_boundary_incomplete/);
        const extra = cloneV2(v2Boundary(root)) as any;
        extra.provider = 'forbidden';
        await assert.rejects(prepare(extra, root),
            /augury_mission_boundary_incomplete/);

        const v1 = cloneV2(v2Boundary(root)) as any;
        v1.schema = 'cstar.augury_mission_boundary.v1';
        delete v1.version;
        const session = setSession();
        await assert.rejects(prepareAuguryMissionBoundary({
            boundary: v1 as AuguryMissionBoundaryInput,
            expected_root: root,
            request_context: validRequestContext(session.threadId, session.turnId),
            now: Date.parse(session.timestamp) + 1_000,
        }), /augury_mission_plan_invalid/);
    });

    it('requires a canonical binding for Forge and exact nulls for every non-Forge item', async () => {
        const root = createV2Root();
        const omitted = cloneV2(v2Boundary(root));
        omitted.bead_plan[0]!.forge_child_request_template = null;
        await assert.rejects(prepare(omitted, root),
            /augury_mission_forge_template_required/);

        const nonForge = cloneV2(v2Boundary(root));
        Object.assign(nonForge.bead_plan[1]!, templateBinding(responseOnlyTemplate()));
        await assert.rejects(prepare(nonForge, root),
            /augury_mission_non_forge_template_forbidden/);

        const missingKey = cloneV2(v2Boundary(root)) as any;
        delete missingKey.bead_plan[0].forge_child_request_template_bytes;
        await assert.rejects(prepare(missingKey, root), /augury_mission_plan_invalid/);
    });

    it('binds every per-item and aggregate v2 hash to complete canonical bytes', async () => {
        const root = createV2Root();
        const receipt = await createV2Receipt(v2Boundary(root), root);
        const forge = receipt.bead_plan[0]!;
        const canonicalTemplate = stableAuguryMissionJson(
            forge.forge_child_request_template,
        );
        assert.equal(receipt.schema, 'cstar.augury_mission_receipt.v2');
        assert.equal(receipt.version, 2);
        assert.equal(receipt.forge_request_template_count, 1);
        assert.equal(forge.forge_child_request_template_bytes,
            Buffer.byteLength(canonicalTemplate, 'utf-8'));
        assert.equal(forge.forge_child_request_template_sha256,
            hashAuguryMissionValue(forge.forge_child_request_template));
        assert.notEqual(canonicalTemplate.length, 0);
        assert.equal(receipt.ordered_plan_sha256, hashAuguryMissionValue({
            schema: 'cstar.augury_ordered_bead_plan.v2',
            ordered_plan_count: receipt.bead_plan.length,
            bead_plan: receipt.bead_plan,
        }));
        assert.equal(receipt.ordered_forge_request_templates_sha256,
            hashOrderedForgeChildRequestTemplates([{
                order: forge.order,
                bead_id: forge.bead_id,
                template: forge.forge_child_request_template!,
                template_sha256: forge.forge_child_request_template_sha256!,
                template_bytes: forge.forge_child_request_template_bytes!,
            }]));
        const { canonical_payload_sha256, receipt_id, ...payload } = receipt;
        assert.equal(canonical_payload_sha256, hashAuguryMissionValue(payload));
        assert.equal(receipt_id, `augury-mission:${hashAuguryMissionValue({
            schema: 'cstar.augury_mission_receipt_id.v2',
            canonical_payload_sha256,
        })}`);
    });

    it('matches the hard-coded v2 canonical golden receipt and every template binding', async () => {
        const root = createFixedV2Root(GOLDEN_ROOT);
        const boundary = v2Boundary(root);
        makeTwoForge(boundary);
        const receipt = await createV2Receipt(boundary, root);
        const bytes = canonicalAuguryMissionReceiptJson(receipt);
        assert.equal(receipt.canonical_payload_sha256, GOLDEN_PAYLOAD_SHA256);
        assert.equal(receipt.receipt_id, GOLDEN_RECEIPT_ID);
        assert.equal(receipt.ordered_plan_count, 2);
        assert.equal(receipt.ordered_plan_sha256, GOLDEN_ORDERED_PLAN_SHA256);
        assert.equal(receipt.forge_request_template_count, 2);
        assert.equal(receipt.ordered_forge_request_templates_sha256,
            GOLDEN_ORDERED_TEMPLATES_SHA256);
        assert.deepEqual(receipt.bead_plan.map((item) => ({
            sha256: item.forge_child_request_template_sha256,
            bytes: item.forge_child_request_template_bytes,
        })), [...GOLDEN_TEMPLATE_BINDINGS]);
        assert.equal(bytes,
            gunzipSync(Buffer.from(GOLDEN_RECEIPT_GZIP_BASE64, 'base64')).toString('utf-8'));
    });

    it('allows only exact version-matched replay across template mutation, reorder, and omission', async () => {
        const root = createV2Root();
        const originalBoundary = v2Boundary(root);
        makeTwoForge(originalBoundary);
        const original = await createV2Receipt(originalBoundary, root);

        const exact = v2Boundary(root);
        makeTwoForge(exact);
        bindV2Replay(exact, original);
        assert.deepEqual(await createV2Receipt(exact, root), original);

        const mutation = cloneV2(exact);
        mutation.bead_plan[0]!.forge_child_request_template!.prompt = 'mutated';
        Object.assign(mutation.bead_plan[0]!,
            templateBinding(mutation.bead_plan[0]!.forge_child_request_template!));
        await assert.rejects(createV2Receipt(mutation, root),
            /augury_mission_replay_mismatch/);

        const reordered = cloneV2(exact);
        const first = templateBinding(
            reordered.bead_plan[0]!.forge_child_request_template!,
        );
        const second = templateBinding(
            reordered.bead_plan[1]!.forge_child_request_template!,
        );
        Object.assign(reordered.bead_plan[0]!, second);
        Object.assign(reordered.bead_plan[1]!, first);
        await assert.rejects(createV2Receipt(reordered, root),
            /augury_mission_replay_mismatch/);

        const omitted = cloneV2(exact);
        omitted.bead_plan[1]!.lane = 'corvus_eye';
        omitted.bead_plan[1]!.forge_child_request_template = null;
        omitted.bead_plan[1]!.forge_child_request_template_sha256 = null;
        omitted.bead_plan[1]!.forge_child_request_template_bytes = null;
        await assert.rejects(createV2Receipt(omitted, root),
            /augury_mission_replay_mismatch/);
    });

    it('rejects forged per-item bytes or hash before emitting a receipt', async () => {
        const root = createV2Root();
        const badHash = v2Boundary(root);
        badHash.bead_plan[0]!.forge_child_request_template_sha256 = '0'.repeat(64);
        await assert.rejects(prepare(badHash, root), /binding_mismatch/);
        const badBytes = v2Boundary(root);
        badBytes.bead_plan[0]!.forge_child_request_template_bytes! += 1;
        await assert.rejects(prepare(badBytes, root), /binding_mismatch/);
    });

    it('supports the exact 64-item boundary without weakening aggregate hashes', async () => {
        const root = createV2Root();
        const boundary = v2Boundary(root);
        boundary.contained_target_paths = [];
        boundary.bead_plan = [];
        for (let index = 0; index < 64; index += 1) {
            const suffix = String(index + 1).padStart(2, '0');
            const target = `work/child-${suffix}.ts`;
            boundary.contained_target_paths.push(target);
            const template = responseOnlyTemplate({ objective: `Child ${suffix}.` });
            boundary.bead_plan.push({
                bead_id: `bead:cstar:augury-v2:item-${suffix}`,
                dependencies: index === 0
                    ? [boundary.proposed_parent_bead_id]
                    : [boundary.bead_plan[index - 1]!.bead_id],
                lane: 'forge',
                target_paths: [target],
                acceptance_obligations: [`Child ${suffix} exact.`],
                checker_obligations: [`check-${suffix}`],
                ...templateBinding(template),
            });
        }
        const receipt = await createV2Receipt(boundary, root);
        assert.equal(receipt.ordered_plan_count, 64);
        assert.equal(receipt.forge_request_template_count, 64);
        assert.match(receipt.ordered_plan_sha256, /^[a-f0-9]{64}$/);
        assert.match(receipt.ordered_forge_request_templates_sha256, /^[a-f0-9]{64}$/);
    });
});
