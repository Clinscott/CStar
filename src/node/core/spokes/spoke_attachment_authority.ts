import type { HallMountedSpokeRecord } from '../../../types/hall.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';
import { database } from '../../../tools/pennyone/intel/database.js';
import {
    getActiveAttachmentReceipt,
    getAttachmentReceiptById,
    isAttachmentReceiptHashValid,
} from '../../../tools/pennyone/intel/spoke_attachment_store.js';
import {
    hashSpokeAttachmentRootPath,
    proveSpokeAttachmentRoot,
    type SpokeAttachmentRootProof,
} from '../../../tools/pennyone/intel/spoke_attachment_root_proof.js';
import {
    SPOKE_ATTACHMENT_RECEIPT_SCHEMA,
    SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA,
} from '../../../tools/pennyone/intel/spoke_attachment_schema_runtime.js';
import {
    verifyMountToken,
    type MountTokenVerdict,
} from './spoke_authority.js';

export type SpokeAuthorityVerification =
    | 'token_verified'
    | 'hall_attachment_verified'
    | 'unverified'
    | 'failed';

export type SpokeAuthorityFailureCode =
    | 'spoke_attachment_policy_drift'
    | 'spoke_attachment_root_moved_or_drift'
    | 'spoke_attachment_wrong_hub'
    | 'spoke_attachment_receipt_mismatch'
    | 'spoke_attachment_receipt_revoked'
    | 'spoke_attachment_token_mismatch'
    | 'spoke_attachment_identity_invalid'
    | 'spoke_attachment_identity_missing';

export interface VerifyMountedSpokeAuthorityResult {
    authority_verification: SpokeAuthorityVerification;
    failure_code?: SpokeAuthorityFailureCode;
    mount_token: MountTokenVerdict;
    root_sha256: string;
    identity_present: boolean;
}

interface AttachmentMetadata {
    schema: string;
    receipt_id: string;
    receipt_sha256: string;
}

function attachmentMetadata(spoke: HallMountedSpokeRecord): AttachmentMetadata | null {
    if (!spoke.metadata || !Object.prototype.hasOwnProperty.call(spoke.metadata, 'attachment_authority')) {
        return null;
    }
    const value = spoke.metadata?.attachment_authority;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { schema: '', receipt_id: '', receipt_sha256: '' };
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).sort().join(',') !== 'receipt_id,receipt_sha256,schema'
        || typeof record.schema !== 'string'
        || typeof record.receipt_id !== 'string'
        || typeof record.receipt_sha256 !== 'string') {
        return { schema: '', receipt_id: '', receipt_sha256: '' };
    }
    return {
        schema: record.schema,
        receipt_id: record.receipt_id,
        receipt_sha256: record.receipt_sha256,
    };
}

function failed(
    failure_code: SpokeAuthorityFailureCode,
    rootSha256: string,
): VerifyMountedSpokeAuthorityResult {
    return {
        authority_verification: 'failed',
        failure_code,
        mount_token: 'unproven',
        root_sha256: rootSha256,
        identity_present: false,
    };
}

function tokenFailure(
    verdict: MountTokenVerdict,
    rootSha256: string,
    identityPresent: boolean,
): VerifyMountedSpokeAuthorityResult {
    const failure_code: SpokeAuthorityFailureCode = verdict === 'identity_invalid'
        ? 'spoke_attachment_identity_invalid'
        : verdict === 'identity_missing' || verdict === 'hall_missing'
            ? 'spoke_attachment_identity_missing'
            : 'spoke_attachment_token_mismatch';
    return {
        authority_verification: 'failed',
        failure_code,
        mount_token: verdict,
        root_sha256: rootSha256,
        identity_present: identityPresent,
    };
}

function verifyAttachmentBinding(
    spoke: HallMountedSpokeRecord,
    metadata: AttachmentMetadata,
): { proof: SpokeAttachmentRootProof; receiptSha256: string } | VerifyMountedSpokeAuthorityResult {
    const rootSha256 = hashSpokeAttachmentRootPath(spoke.root_path);
    const repository = database.getHallRepository(registry.getRoot());
    const hubRepoId = repository?.repo_id || buildHallRepositoryId(normalizeHallPath(registry.getRoot()));
    if (spoke.repo_id !== hubRepoId) return failed('spoke_attachment_wrong_hub', rootSha256);
    let proof: SpokeAttachmentRootProof;
    try {
        proof = proveSpokeAttachmentRoot(spoke.root_path);
    } catch (error) {
        const code = error instanceof Error ? error.message : '';
        return failed(
            code.startsWith('spoke_attachment_agents_')
                ? 'spoke_attachment_policy_drift'
                : 'spoke_attachment_root_moved_or_drift',
            rootSha256,
        );
    }
    if (proof.canonical_root_path !== spoke.root_path
        || proof.canonical_slug !== spoke.slug) {
        return failed('spoke_attachment_root_moved_or_drift', rootSha256);
    }
    if (spoke.mount_status !== 'active' || spoke.trust_level !== 'trusted'
        || spoke.write_policy !== 'read_write') {
        return failed('spoke_attachment_policy_drift', rootSha256);
    }
    if (metadata.schema !== SPOKE_ATTACHMENT_RECEIPT_SCHEMA
        || !/^[a-f0-9]{64}$/.test(metadata.receipt_sha256)) {
        return failed('spoke_attachment_receipt_mismatch', rootSha256);
    }
    const receipt = getAttachmentReceiptById(metadata.receipt_id);
    if (!receipt || receipt.receipt_sha256 !== metadata.receipt_sha256
        || receipt.schema !== SPOKE_ATTACHMENT_RECEIPT_SCHEMA
        || receipt.root_binding_schema !== SPOKE_ATTACHMENT_ROOT_BINDING_SCHEMA
        || receipt.event_kind !== 'link_authority'
        || !isAttachmentReceiptHashValid(receipt)
        || receipt.hub_repo_id !== hubRepoId || receipt.slug !== spoke.slug) {
        return failed('spoke_attachment_receipt_mismatch', rootSha256);
    }
    if (receipt.policy_sha256 !== proof.policy_sha256
        || receipt.policy_path_sha256 !== proof.policy_path_sha256) {
        return failed('spoke_attachment_policy_drift', rootSha256);
    }
    if (receipt.root_path_sha256 !== proof.root_path_sha256
        || receipt.root_identity_sha256 !== proof.root_identity_sha256
        || receipt.root_device !== proof.root_device
        || receipt.root_inode !== proof.root_inode
        || receipt.root_size !== proof.root_size
        || receipt.root_mode !== proof.root_mode
        || receipt.root_sha256 !== proof.root_sha256) {
        return failed('spoke_attachment_root_moved_or_drift', rootSha256);
    }
    const active = getActiveAttachmentReceipt(
        hubRepoId,
        spoke.slug,
        proof,
        metadata.receipt_id,
    );
    if (!active) {
        return receipt.event_kind === 'link_authority'
            ? failed('spoke_attachment_receipt_revoked', rootSha256)
            : failed('spoke_attachment_receipt_mismatch', rootSha256);
    }
    return { proof, receiptSha256: active.receipt_sha256 };
}

/** Verify Hall-owned attachment binding before invoking the unchanged token verifier. */
export function verifyMountedSpokeAuthority(
    spoke: HallMountedSpokeRecord,
): VerifyMountedSpokeAuthorityResult {
    const metadata = attachmentMetadata(spoke);
    if (!metadata) {
        const hallAuthority = spoke.metadata?.authority;
        const hallToken = hallAuthority && typeof hallAuthority === 'object' && !Array.isArray(hallAuthority)
            && typeof (hallAuthority as Record<string, unknown>).mount_token === 'string'
            ? (hallAuthority as Record<string, unknown>).mount_token as string : null;
        const token = verifyMountToken(spoke.root_path, hallToken);
        if (token.verdict === 'ok') {
            return {
                authority_verification: 'token_verified',
                mount_token: token.verdict,
                root_sha256: token.root_sha256,
                identity_present: token.identity_present,
            };
        }
        if (token.verdict === 'unproven') {
            return {
                authority_verification: 'unverified',
                mount_token: token.verdict,
                root_sha256: token.root_sha256,
                identity_present: token.identity_present,
            };
        }
        return tokenFailure(token.verdict, token.root_sha256, token.identity_present);
    }

    const binding = verifyAttachmentBinding(spoke, metadata);
    if ('authority_verification' in binding) return binding;
    const hallAuthority = spoke.metadata?.authority;
    const hallToken = hallAuthority && typeof hallAuthority === 'object' && !Array.isArray(hallAuthority)
        && typeof (hallAuthority as Record<string, unknown>).mount_token === 'string'
        ? (hallAuthority as Record<string, unknown>).mount_token as string : null;
    const token = verifyMountToken(spoke.root_path, hallToken);
    if (token.verdict === 'ok') {
        return {
            authority_verification: 'token_verified',
            mount_token: token.verdict,
            root_sha256: token.root_sha256,
            identity_present: token.identity_present,
        };
    }
    if (!token.identity_present && token.verdict === 'unproven') {
        return {
            authority_verification: 'hall_attachment_verified',
            mount_token: token.verdict,
            root_sha256: token.root_sha256,
            identity_present: false,
        };
    }
    return tokenFailure(token.verdict, token.root_sha256, token.identity_present);
}
