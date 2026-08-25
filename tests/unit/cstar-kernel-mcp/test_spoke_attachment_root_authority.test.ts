import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    CORVUS_CSTAR_ROOT,
    CORVUS_ESTATE_ROOT,
    assertExactSpokeAttachmentSlug,
    assertSpokeAttachmentRootProofStable,
    pathsOverlap,
    proveSpokeAttachmentRoot,
} from '../../../src/tools/pennyone/intel/spoke_attachment_root_proof.js';
import {
    parseCurrentRootTurnGrant,
    type CurrentRootTurnAuthorityRecord,
    type CurrentRootTurnGrantTarget,
} from '../../../src/tools/cstar-kernel-mcp/tools/spoke_attachment_authority.js';

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

function makeSyntheticRepository(policy = 'Synthetic attachment fixture.\n'): string {
    const root = fs.mkdtempSync(path.join(CORVUS_ESTATE_ROOT, 'cstar-attachment-root-'));
    fs.writeFileSync(path.join(root, 'AGENTS.md'), policy, { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
    return root;
}

function makeSyntheticRepositoryAt(root: string): void {
    fs.mkdirSync(root, { mode: 0o700 });
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic case-binding fixture.\n', { mode: 0o600 });
    fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
}

function target(rootPath: string, slug: string, action: CurrentRootTurnGrantTarget['action'] = 'link'):
CurrentRootTurnGrantTarget {
    return { action, slug, root_path: rootPath };
}

function record(text: string, index = 0): CurrentRootTurnAuthorityRecord {
    return { text, record_sha256: sha256(`${index}:${text}`) };
}

describe('CStar spoke attachment root and current-turn authority', () => {
    it('binds policy bytes and durable root identity without creating .cstar identity', () => {
        const policy = 'Synthetic attachment fixture.\n';
        const root = makeSyntheticRepository(policy);
        try {
            const proof = proveSpokeAttachmentRoot(root);
            assert.equal(proof.canonical_root_path, root);
            assert.equal(proof.canonical_slug, path.basename(root).toLowerCase());
            assert.equal(proof.policy_sha256, sha256(policy));
            assert.match(proof.root_identity_sha256, /^[a-f0-9]{64}$/);
            assert.match(proof.root_device, /^\d+$/);
            assert.match(proof.root_inode, /^\d+$/);
            assert.match(proof.root_size, /^\d+$/);
            assert.notEqual(proof.root_sha256, sha256(root));
            assert.equal(fs.existsSync(path.join(root, '.cstar')), false);
            assert.doesNotThrow(() => assertSpokeAttachmentRootProofStable(proof));
            assert.doesNotThrow(() => assertExactSpokeAttachmentSlug(proof.canonical_slug, proof));
            assert.equal(pathsOverlap(root, path.join(root, 'child')), true);
            assert.equal(pathsOverlap(root, path.join(CORVUS_ESTATE_ROOT, 'elsewhere')), false);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails closed when nearest AGENTS bytes change', () => {
        const root = makeSyntheticRepository();
        try {
            const proof = proveSpokeAttachmentRoot(root);
            fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Changed policy bytes.\n', { mode: 0o600 });
            assert.equal(
                failureCode(() => assertSpokeAttachmentRootProofStable(proof)),
                'spoke_attachment_policy_bytes_drift',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('fails closed when the root object is replaced at the same path', () => {
        const root = makeSyntheticRepository();
        const displaced = `${root}-displaced`;
        try {
            const proof = proveSpokeAttachmentRoot(root);
            fs.renameSync(root, displaced);
            fs.mkdirSync(root, { mode: 0o700 });
            fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Synthetic attachment fixture.\n', { mode: 0o600 });
            fs.mkdirSync(path.join(root, '.git'), { mode: 0o700 });
            assert.equal(
                failureCode(() => assertSpokeAttachmentRootProofStable(proof)),
                'spoke_attachment_root_object_replaced',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(displaced, { recursive: true, force: true });
        }
    });

    it('rejects noncanonical, outside, symlink, and slug/root aliases', () => {
        const root = makeSyntheticRepository();
        const alias = path.join(CORVUS_ESTATE_ROOT, `cstar-attachment-alias-${process.pid}`);
        let aliasCreated = false;
        try {
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(` ${root}`)), 'spoke_attachment_root_path_not_canonical');
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(`${root} `)), 'spoke_attachment_root_path_not_canonical');
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(`\t${root}\n`)), 'spoke_attachment_root_path_not_canonical');
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(`${root}/`)), 'spoke_attachment_root_path_not_canonical');
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(`${root}/../${path.basename(root)}`)), 'spoke_attachment_root_path_not_canonical');
            assert.equal(failureCode(() => proveSpokeAttachmentRoot('/tmp')), 'spoke_attachment_root_outside_corvus');
            assert.equal(
                failureCode(() => proveSpokeAttachmentRoot(CORVUS_CSTAR_ROOT)),
                'spoke_attachment_root_is_cstar',
            );
            fs.symlinkSync(root, alias, 'dir');
            aliasCreated = true;
            assert.equal(failureCode(() => proveSpokeAttachmentRoot(alias)), 'spoke_attachment_root_symlink_forbidden');
            const proof = proveSpokeAttachmentRoot(root);
            assert.equal(failureCode(() => assertExactSpokeAttachmentSlug('different', proof)), 'spoke_attachment_slug_root_mismatch');
        } finally {
            if (aliasCreated) fs.rmSync(alias, { recursive: true, force: true });
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('requires now and binds exactly one selected record in the ordered current set', () => {
        const root = makeSyntheticRepository();
        try {
            const slug = path.basename(root).toLowerCase();
            for (const action of ['link', 'project', 'unlink'] as const) {
                const selected = target(root, slug, action);
                const grant = `Authorize cstar_spoke_attachment ${action} ${slug} ${root} now`;
                const records = [record('Informational preface.', 0), record(grant, 1)];
                assert.deepEqual(parseCurrentRootTurnGrant(records, selected), {
                    selected_record_sha256: records[1]!.record_sha256,
                    selected_record_index: 1,
                });
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant(
                        [record(`Authorize cstar_spoke_attachment ${action} ${slug} ${root}`, 2)],
                        selected,
                    )),
                    'spoke_attachment_current_turn_grant_missing',
                );
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('compares captured slug and root bytes exactly across every action template', () => {
        const root = makeSyntheticRepository();
        try {
            const slug = path.basename(root).toLowerCase();
            const slugCaseDrift = slug.toUpperCase();
            const rootCaseDrift = root.toUpperCase();
            const templates = [
                (action: string, candidateSlug: string, candidateRoot: string) =>
                    `AUTHORIZE CSTAR_SPOKE_ATTACHMENT ${action.toUpperCase()} ${candidateSlug} ${candidateRoot} NOW`,
                (action: string, candidateSlug: string, candidateRoot: string) =>
                    `I AUTHORIZE CSTAR_SPOKE_ATTACHMENT ${action.toUpperCase()} ${candidateSlug} ${candidateRoot} NOW!`,
                (action: string, candidateSlug: string, candidateRoot: string) =>
                    `I AUTHORIZE YOU TO ${action.toUpperCase()} SPOKE ${candidateSlug} AT ${candidateRoot} NOW`,
                (action: string, candidateSlug: string, candidateRoot: string) =>
                    `I AUTHORIZE ${action.toUpperCase()} SPOKE ${candidateSlug} AT ${candidateRoot} NOW.`,
            ];
            let recordIndex = 100;
            for (const action of ['link', 'project', 'unlink'] as const) {
                const selected = target(root, slug, action);
                for (const template of templates) {
                    assert.doesNotThrow(() => parseCurrentRootTurnGrant(
                        [record(template(action, slug, root), recordIndex++)],
                        selected,
                    ));
                    for (const [candidateSlug, candidateRoot] of [
                        [slugCaseDrift, root],
                        [slug, rootCaseDrift],
                        [slugCaseDrift, rootCaseDrift],
                    ] as const) {
                        assert.equal(
                            failureCode(() => parseCurrentRootTurnGrant(
                                [record(template(action, candidateSlug, candidateRoot), recordIndex++)],
                                selected,
                            )),
                            'spoke_attachment_current_turn_target_mismatch',
                        );
                    }
                }
                const exact = record(templates[0](action, slug, root), recordIndex++);
                const exactVariant = record(templates[2](action, slug, root), recordIndex++);
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant([exact, exactVariant], selected)),
                    'spoke_attachment_current_turn_grant_duplicate',
                );
                const drift = record(templates[1](action, slugCaseDrift, root), recordIndex++);
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant([exact, drift], selected)),
                    'spoke_attachment_current_turn_target_mismatch',
                );
            }
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects authority crossing two real case-variant Linux roots', () => {
        const parent = fs.mkdtempSync(path.join(CORVUS_ESTATE_ROOT, 'cstar-attachment-case-binding-'));
        const lowerRoot = path.join(parent, 'case-root');
        const upperRoot = path.join(parent, 'CASE-ROOT');
        try {
            makeSyntheticRepositoryAt(lowerRoot);
            makeSyntheticRepositoryAt(upperRoot);
            const lowerProof = proveSpokeAttachmentRoot(lowerRoot);
            const upperProof = proveSpokeAttachmentRoot(upperRoot);
            assert.notEqual(lowerProof.canonical_root_path, upperProof.canonical_root_path);
            assert.notEqual(lowerProof.root_inode, upperProof.root_inode);
            assert.equal(lowerProof.canonical_slug, 'case-root');
            assert.equal(upperProof.canonical_slug, 'case-root');

            const lowerTarget = target(lowerRoot, lowerProof.canonical_slug);
            const upperTarget = target(upperRoot, upperProof.canonical_slug);
            const lowerGrant = `Authorize cstar_spoke_attachment link case-root ${lowerRoot} now`;
            const upperGrant = `Authorize cstar_spoke_attachment link case-root ${upperRoot} now`;
            assert.doesNotThrow(() => parseCurrentRootTurnGrant([record(lowerGrant, 200)], lowerTarget));
            assert.doesNotThrow(() => parseCurrentRootTurnGrant([record(upperGrant, 201)], upperTarget));
            assert.equal(
                failureCode(() => parseCurrentRootTurnGrant([record(upperGrant, 202)], lowerTarget)),
                'spoke_attachment_current_turn_target_mismatch',
            );
            assert.equal(
                failureCode(() => parseCurrentRootTurnGrant([record(lowerGrant, 203)], upperTarget)),
                'spoke_attachment_current_turn_target_mismatch',
            );
        } finally {
            fs.rmSync(parent, { recursive: true, force: true });
        }
    });

    it('rejects questions, conditions, reports, quotations, negation, and duplicates', () => {
        const root = makeSyntheticRepository();
        try {
            const slug = path.basename(root).toLowerCase();
            const selected = target(root, slug);
            const grant = `Authorize cstar_spoke_attachment link ${slug} ${root} now`;
            const adversarial = [
                `${grant}?`,
                `If I authorize cstar_spoke_attachment link ${slug} ${root} now`,
                `I might authorize cstar_spoke_attachment link ${slug} ${root} now`,
                `The operator says authorize cstar_spoke_attachment link ${slug} ${root} now`,
                `"${grant}"`,
                `I do not authorize cstar_spoke_attachment link ${slug} ${root} now`,
            ];
            for (const [index, text] of adversarial.entries()) {
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant([record(text, index)], selected)),
                    'spoke_attachment_current_turn_nonoperative',
                );
            }
            assert.equal(
                failureCode(() => parseCurrentRootTurnGrant([record(grant, 10), record(grant, 11)], selected)),
                'spoke_attachment_current_turn_grant_duplicate',
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('rejects normalized standalone revocations before or after the grant', () => {
        const root = makeSyntheticRepository();
        try {
            const slug = path.basename(root).toLowerCase();
            const selected = target(root, slug);
            const grant = record(`Authorize cstar_spoke_attachment link ${slug} ${root} now`, 50);
            const revocations = [
                ' Stop. ', 'PAUSE!', 'Cancel it?', 'Revoke this.', 'Withdraw that!',
                'Never   mind.', 'Do not proceed!', 'do not continue.', 'DO NOT RESUME?',
            ];
            for (const [index, text] of revocations.entries()) {
                const revoke = record(text, index);
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant([revoke, grant], selected)),
                    'spoke_attachment_current_turn_revoked',
                );
                assert.equal(
                    failureCode(() => parseCurrentRootTurnGrant([grant, revoke], selected)),
                    'spoke_attachment_current_turn_revoked',
                );
            }
            assert.doesNotThrow(() => parseCurrentRootTurnGrant([grant], selected));
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
