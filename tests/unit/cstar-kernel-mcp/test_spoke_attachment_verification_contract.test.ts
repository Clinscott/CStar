import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { HallMountedSpokeRecord } from '../../../src/types/hall.js';
import { verifyMountedSpokeAuthority } from '../../../src/node/core/spokes/spoke_attachment_authority.js';
import { verifyMountToken } from '../../../src/node/core/spokes/spoke_authority.js';
import { surveySpokesForRecords } from '../../../src/node/core/spokes/spoke_doctor.js';
import { database } from '../../../src/tools/pennyone/intel/database.js';
import { proveSpokeAttachmentRoot } from '../../../src/tools/pennyone/intel/spoke_attachment_root_proof.js';
import {
    newAttachmentReceipt,
    type SpokeAttachmentAuthorityForStore,
} from '../../../src/tools/pennyone/intel/spoke_attachment_store_records.js';
import { adaptSpokeManifestToCapability } from '../../../src/tools/cstar-kernel-mcp/tools/capability.js';
import type { SpokeSkillManifest } from '../../../src/node/core/spokes/spoke_capability_walker.js';

function makeRepository(): string {
    const root = fs.mkdtempSync(path.join('/home/morderith/Corvus', 'cstar-attachment-verify-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic verification fixture.\n', { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
    return root;
}

function authority(): SpokeAttachmentAuthorityForStore {
    return {
        kind: 'current_root_turn',
        source_authority_id: 'authority:attachment-fixture',
        thread_id: 'thread:attachment-fixture',
        turn_id: 'turn:attachment-fixture',
        record_sha256: 'a'.repeat(64),
        record_set_sha256: 'b'.repeat(64),
        record_count: 2,
        selected_record_index: 0,
        child_expires_at: 1_900_000_000_000,
    };
}

function makeReceipt(root: string) {
    const proof = proveSpokeAttachmentRoot(root);
    const receipt = newAttachmentReceipt({
        event_kind: 'link_authority',
        grant_id: 'grant:attachment-fixture',
        hub_repo_id: 'hub-fixture',
        slug: proof.canonical_slug,
        proof,
        authority: authority(),
        created_at: 1_800_000_000_000,
    });
    return { proof, receipt };
}

function receiptDb(receipt: ReturnType<typeof makeReceipt>['receipt'], revoked = false) {
    return {
        prepare(sql: string) {
            return {
                get(value: string) {
                    if (sql.includes('WHERE receipt_id = ?')) {
                        return value === receipt.receipt_id ? { ...receipt } : undefined;
                    }
                    if (sql.includes('revokes_receipt_id = ?')) {
                        return revoked ? { receipt_id: 'receipt:revocation-fixture' } : undefined;
                    }
                    return undefined;
                },
            };
        },
    };
}

function attachmentSpoke(
    root: string,
    receipt: ReturnType<typeof makeReceipt>['receipt'],
    metadataAuthority: Record<string, unknown> = {},
): HallMountedSpokeRecord {
    return {
        spoke_id: `spoke:${receipt.slug}`,
        repo_id: 'hub-fixture',
        slug: receipt.slug,
        kind: 'local',
        root_path: root,
        mount_status: 'active',
        trust_level: 'trusted',
        write_policy: 'read_write',
        projection_status: 'missing',
        metadata: {
            attachment_authority: {
                schema: receipt.schema,
                receipt_id: receipt.receipt_id,
                receipt_sha256: receipt.receipt_sha256,
            },
            ...metadataAuthority,
        },
        created_at: receipt.created_at,
        updated_at: receipt.created_at,
    };
}

describe('CStar spoke attachment verification and public contract', () => {
    it('keeps Doctor Hall-only and reports attachment authority as not checked', (t) => {
        const doctorSource = fs.readFileSync(
            path.join(process.cwd(), 'src/node/core/spokes/spoke_doctor.ts'),
            'utf8',
        );
        const surveyStart = doctorSource.indexOf('export function surveySpokesForRecords');
        const surveyEnd = doctorSource.indexOf('export function surveySpokes(', surveyStart);
        assert.ok(surveyStart >= 0 && surveyEnd > surveyStart);
        const surveySource = doctorSource.slice(surveyStart, surveyEnd);
        assert.doesNotMatch(
            surveySource,
            /verifyMountedSpokeAuthority|proveSpokeAttachmentRoot|verifyMountToken|\bfs\./,
        );
        assert.doesNotMatch(doctorSource, /from ['"]node:fs['"]/);

        const healthStart = doctorSource.indexOf('export function healthCheckSpoke');
        const healthEnd = doctorSource.indexOf('export interface SpokeVerifyReport', healthStart);
        const verifyStart = doctorSource.indexOf('export function verifySpoke');
        const verifyEnd = doctorSource.indexOf('/** Dry-run exact-row comparison', verifyStart);
        assert.match(doctorSource.slice(healthStart, healthEnd), /verifyMountedSpokeAuthority\(spoke\)/);
        assert.match(doctorSource.slice(verifyStart, verifyEnd), /verifyMountedSpokeAuthority\(spoke\)/);

        let hallLookups = 0;
        let filesystemCalls = 0;
        t.mock.method(database, 'getHallRepository', () => {
            hallLookups += 1;
            return { repo_id: 'hub-fixture' };
        });
        t.mock.method(fs, 'lstatSync', () => {
            filesystemCalls += 1;
            throw new Error('doctor_filesystem_probe_forbidden');
        });
        const row: HallMountedSpokeRecord = {
            spoke_id: 'spoke:doctor-hall-only',
            repo_id: 'hub-fixture',
            slug: 'doctor-hall-only',
            kind: 'local',
            root_path: '/home/morderith/Corvus/doctor-must-not-probe',
            mount_status: 'active',
            trust_level: 'trusted',
            write_policy: 'read_write',
            projection_status: 'current',
            metadata: {
                attachment_authority: {
                    schema: 'cstar.spoke_attachment_receipt.v1',
                    receipt_id: 'receipt:must-not-be-read',
                    receipt_sha256: 'a'.repeat(64),
                },
            },
            created_at: 1,
            updated_at: 1,
        };

        const report = surveySpokesForRecords([row], 'hub-fixture', new Date(0));
        const entry = report.spokes[0]!;
        assert.equal(hallLookups, 0);
        assert.equal(filesystemCalls, 0);
        assert.deepEqual(entry.attachment_authority, {
            observation: 'unobserved',
            verification: 'not_checked',
        });
        assert.equal(entry.filesystem_observation, 'not_performed');
        assert.equal('filesystem_observed' in entry, false);
        assert.equal('authority_verification' in entry, false);
        assert.equal('mount_token' in entry, false);
    });

    it('preserves legacy token verdicts and accepts a valid attachment token', (t) => {
        const root = makeRepository();
        const token = 'synthetic-attachment-token';
        const identityDir = path.join(root, '.cstar');
        fs.mkdirSync(identityDir, { mode: 0o700 });
        fs.writeFileSync(path.join(identityDir, 'IDENTITY.json'), JSON.stringify({ mount_token: token }), { mode: 0o600 });
        const { proof, receipt } = makeReceipt(root);
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'tryGetReadDb', () => receiptDb(receipt));
        try {
            const legacy = verifyMountToken(root, token);
            assert.equal(legacy.verdict, 'ok');
            const verified = verifyMountedSpokeAuthority(attachmentSpoke(root, receipt, {
                authority: { mount_token: token },
            }));
            assert.equal(verified.authority_verification, 'token_verified');
            assert.equal(verified.mount_token, legacy.verdict);
            assert.equal(verified.identity_present, true);
            assert.equal(proof.canonical_root_path, root);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('uses active Hall authority only with no identity and never masks contradiction', (t) => {
        const root = makeRepository();
        fs.mkdirSync(path.join(root, '.cstar'), { mode: 0o700 });
        const { receipt } = makeReceipt(root);
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'tryGetReadDb', () => receiptDb(receipt));
        try {
            const spoke = attachmentSpoke(root, receipt);
            const hallVerified = verifyMountedSpokeAuthority(spoke);
            assert.equal(hallVerified.authority_verification, 'hall_attachment_verified');
            assert.equal(hallVerified.mount_token, 'unproven');
            assert.equal('receipt_id' in hallVerified, false);

            fs.writeFileSync(path.join(root, '.cstar', 'IDENTITY.json'), '{malformed', { mode: 0o600 });
            const malformed = verifyMountedSpokeAuthority(spoke);
            assert.equal(malformed.authority_verification, 'failed');
            assert.equal(malformed.failure_code, 'spoke_attachment_identity_invalid');

            fs.writeFileSync(path.join(root, '.cstar', 'IDENTITY.json'), '{}', { mode: 0o600 });
            const missing = verifyMountedSpokeAuthority(attachmentSpoke(root, receipt, {
                authority: { mount_token: 'expected-token' },
            }));
            assert.equal(missing.failure_code, 'spoke_attachment_identity_missing');

            fs.writeFileSync(path.join(root, '.cstar', 'IDENTITY.json'), JSON.stringify({ mount_token: 'wrong-token' }), { mode: 0o600 });
            const mismatch = verifyMountedSpokeAuthority(attachmentSpoke(root, receipt, {
                authority: { mount_token: 'expected-token' },
            }));
            assert.equal(mismatch.failure_code, 'spoke_attachment_token_mismatch');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns exact hub, mounted-policy, receipt, and revocation failures before tokens', (t) => {
        const root = makeRepository();
        const { receipt } = makeReceipt(root);
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        t.mock.method(database, 'tryGetReadDb', () => receiptDb(receipt));
        try {
            const base = attachmentSpoke(root, receipt);
            assert.equal(verifyMountedSpokeAuthority({ ...base, repo_id: 'other-hub' }).failure_code, 'spoke_attachment_wrong_hub');
            assert.equal(verifyMountedSpokeAuthority({ ...base, trust_level: 'observe' }).failure_code, 'spoke_attachment_policy_drift');
            assert.equal(verifyMountedSpokeAuthority({ ...base, slug: 'wrong-slug' }).failure_code, 'spoke_attachment_root_moved_or_drift');
            assert.equal(verifyMountedSpokeAuthority({
                ...base,
                metadata: { attachment_authority: { schema: receipt.schema, receipt_id: receipt.receipt_id, receipt_sha256: 'c'.repeat(64) } },
            }).failure_code, 'spoke_attachment_receipt_mismatch');

            t.mock.method(database, 'tryGetReadDb', () => receiptDb(receipt, true));
            assert.equal(verifyMountedSpokeAuthority(base).failure_code, 'spoke_attachment_receipt_revoked');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('detects policy-byte drift and same-path root replacement with distinct failure codes', (t) => {
        const policyRoot = makeRepository();
        const root = makeRepository();
        const displaced = `${root}-displaced`;
        const policyReceipt = makeReceipt(policyRoot).receipt;
        const receipt = makeReceipt(root).receipt;
        t.mock.method(database, 'getHallRepository', () => ({ repo_id: 'hub-fixture' }));
        try {
            fs.writeFileSync(path.join(policyRoot, 'AGENTS.md'), 'Changed policy bytes.\n', { mode: 0o600 });
            t.mock.method(database, 'tryGetReadDb', () => receiptDb(policyReceipt));
            assert.equal(
                verifyMountedSpokeAuthority(attachmentSpoke(policyRoot, policyReceipt)).failure_code,
                'spoke_attachment_policy_drift',
            );

            fs.renameSync(root, displaced);
            fs.mkdirSync(root, { mode: 0o700 });
            fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic verification fixture.\n', { mode: 0o600 });
            fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
            t.mock.method(database, 'tryGetReadDb', () => receiptDb(receipt));
            assert.equal(
                verifyMountedSpokeAuthority(attachmentSpoke(root, receipt)).failure_code,
                'spoke_attachment_root_moved_or_drift',
            );
        } finally {
            fs.rmSync(policyRoot, { recursive: true, force: true });
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(displaced, { recursive: true, force: true });
        }
    });

    it('keeps capability projection fields because the public adapter exposes them', () => {
        const manifest = {
            id: 'keepos:fixture', bare_id: 'fixture', spoke_slug: 'keepos',
            authority_path: '.agents/skills/fixture/SKILL.md', name: 'Fixture',
            description: 'Synthetic.', tier: 'SKILL', risk: 'low', frontmatter_raw: {},
            documentation: '# Fixture', validation: 'ok', shadows_hub_id: false,
            authority_verification: 'hall_attachment_verified',
            authority_failure_code: undefined, mount_token: 'unproven',
        } satisfies SpokeSkillManifest;
        const capability = adaptSpokeManifestToCapability(manifest);
        assert.equal(capability.authority_verification, 'hall_attachment_verified');
        assert.equal(capability.authority_failure_code, undefined);
        assert.equal(capability.mount_token, 'unproven');
    });

    it('keeps handlers SQL-free and enforces immutable event-specific Hall schema', () => {
        const handler = fs.readFileSync(path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/tools/spoke_attachment.ts'), 'utf8');
        const controller = fs.readFileSync(path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/tools/spoke_attachment_controller.ts'), 'utf8');
        const schema = fs.readFileSync(path.join(process.cwd(), 'src/tools/pennyone/intel/spoke_attachment_schema_runtime.ts'), 'utf8');
        const catalog = fs.readFileSync(path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/contracts/tool_catalog.ts'), 'utf8');
        const importTool = fs.readFileSync(path.join(process.cwd(), 'src/tools/cstar-kernel-mcp/tools/spoke_bead_import.ts'), 'utf8');
        assert.doesNotMatch(handler, /\b(?:SELECT|INSERT|UPDATE|DELETE|prepare|transaction)\b/i);
        assert.doesNotMatch(controller, /\b(?:SELECT|INSERT|UPDATE|DELETE|prepare|transaction)\b/i);
        assert.match(schema, /cstar\.spoke_attachment_authority_grant\.v1/);
        assert.match(schema, /cstar\.spoke_attachment_receipt\.v1/);
        assert.match(schema, /uq_hall_spoke_attachment_receipts_revocation/);
        assert.match(schema, /hall_spoke_attachment_receipt_grant_binding/);
        assert.match(schema, /DROP TRIGGER IF EXISTS hall_spoke_attachment_receipt_parent_link/);
        assert.match(schema, /parent_link_receipt_id/);
        for (const field of [
            'root_path_sha256', 'root_sha256', 'policy_sha256', 'policy_path_sha256',
            'root_identity_sha256', 'root_device', 'root_inode', 'root_size', 'root_mode',
        ]) {
            assert.match(schema, new RegExp(`parent\\.${field} = NEW\\.${field}`));
        }
        assert.match(schema, /revokes_receipt_id = parent_link_receipt_id/);
        assert.match(schema, /immutable_update/);
        assert.match(schema, /immutable_delete/);
        assert.doesNotMatch(schema, /\broot_path TEXT\b/);
        assert.match(catalog, /name: 'cstar_spoke_attachment'/);
        assert.match(importTool, /spoke_import_unstructured_metadata_forbidden/);
        assert.doesNotMatch(importTool, /metadata\?:/);
    });
});
