import { createHash } from 'node:crypto';

import {
    classifyCodexSessionRecord,
    createSealedCanonicalCodexUserTurnAccumulator,
} from './codex_request_identity.js';
import {
    createCodexPlatformContextProjection,
    scanFixedCodexSession,
} from './codex_session_authority_projection.js';
import {
    findCodexSessionFile,
    MAX_CODEX_SESSION_FILE_BYTES,
    resolveCodexSessionsRoot,
} from './codex_session_locator.js';
import type { AutonomousDispatchPolicyBinding } from './forge_autonomous_policy_contract.js';
import { isForgeAuthorityRevocation } from './forge_revocation.js';
import { stableJson } from './forge_request_contract.js';

const POLICY_MAX_AGE_MS = 366 * 24 * 60 * 60 * 1_000;
const POLICY_SESSION_SCAN_ATTEMPTS = 3;

export interface ForgeAutonomousPolicySignal {
    record_sha256: string;
    record_set_sha256: string;
    record_count: number;
    thread_id: string;
    turn_id: string;
    authorized_at: number;
    expires_at: number;
    root_session_record_set_sha256: string;
    root_session_record_count: number;
    root_session_file_bytes: number;
}

export interface CodexRootSessionSnapshot {
    root_session_record_set_sha256: string;
    root_session_record_count: number;
    root_session_file_bytes: number;
}

function sha256(value: unknown): string {
    return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function canonicalRootUserText(row: Record<string, unknown>): string | null {
    const classification = classifyCodexSessionRecord(row);
    if (classification.kind !== 'canonical-root-user' || !classification.rootLineage) return null;
    const payload = row.payload as Record<string, unknown> | undefined;
    const content = Array.isArray(payload?.content) ? payload.content : null;
    if (!content || !content.every((entry) => entry && typeof entry === 'object'
        && (entry as { type?: unknown }).type === 'input_text'
        && typeof (entry as { text?: unknown }).text === 'string')) {
        throw new Error('forge_autonomous_policy_signal_uninspectable');
    }
    return content.map((entry) => (entry as { text: string }).text).join('');
}

export function readCodexRootSessionSnapshot(threadId: string): CodexRootSessionSnapshot {
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), threadId);
    const snapshot = scanFixedCodexSession(
        sessionFile, MAX_CODEX_SESSION_FILE_BYTES, () => undefined,
    );
    return {
        root_session_record_set_sha256: snapshot.sha256,
        root_session_record_count: snapshot.recordCount,
        root_session_file_bytes: snapshot.fileBytes,
    };
}

export function readForgeAutonomousPolicySignal(
    binding: AutonomousDispatchPolicyBinding,
    now = Date.now(),
): ForgeAutonomousPolicySignal {
    const parent = binding.parent;
    const sessionFile = findCodexSessionFile(resolveCodexSessionsRoot(), parent.identity.thread_id);
    let lastSessionReadError: Error | undefined;
    for (let attempt = 0; attempt < POLICY_SESSION_SCAN_ATTEMPTS; attempt += 1) {
        const canonical = createSealedCanonicalCodexUserTurnAccumulator(
            parent.identity.thread_id,
            parent.identity.turn_id,
            now,
            POLICY_MAX_AGE_MS,
            parent.identity.turn_record_set_sha256,
        );
        const projection = createCodexPlatformContextProjection((record) => {
            const classification = classifyCodexSessionRecord(record.row);
            if (classification.kind !== 'canonical-root-user' || !classification.rootLineage) return;
            const timestamp = Date.parse(String(record.row.timestamp ?? ''));
            if (!Number.isFinite(timestamp)) throw new Error('forge_autonomous_policy_signal_uninspectable');
            if (timestamp < parent.issued_at && classification.turnId !== parent.identity.turn_id) return;
            const text = canonicalRootUserText(record.row);
            if (text !== null && isForgeAuthorityRevocation(text)) {
                throw new Error('forge_autonomous_policy_revoked');
            }
        });
        try {
            const sessionSnapshot = scanFixedCodexSession(
                sessionFile, MAX_CODEX_SESSION_FILE_BYTES, (record) => {
                    canonical.consume(record);
                    projection.consume(record);
                },
            );
            projection.finish();
            const turn = canonical.finish();
            return {
                record_sha256: sha256({
                    schema: 'cstar.autonomous_dispatch_policy_signal.v1',
                    policy_sha256: parent.policy_sha256,
                    policy_id: parent.decision_id,
                    parent_bead_id: parent.bead_id,
                    thread_id: parent.identity.thread_id,
                    turn_id: parent.identity.turn_id,
                    record_set_sha256: turn.recordSetSha256,
                }),
                record_set_sha256: turn.recordSetSha256,
                record_count: turn.recordCount,
                thread_id: parent.identity.thread_id,
                turn_id: parent.identity.turn_id,
                authorized_at: parent.issued_at,
                expires_at: parent.expires_at,
                root_session_record_set_sha256: sessionSnapshot.sha256,
                root_session_record_count: sessionSnapshot.recordCount,
                root_session_file_bytes: sessionSnapshot.fileBytes,
            };
        } catch (error) {
            if (error instanceof Error
                && error.message === 'codex_request_identity_session_changed_during_read'
                && attempt + 1 < POLICY_SESSION_SCAN_ATTEMPTS) {
                lastSessionReadError = error;
                continue;
            }
            if (error instanceof Error
                && error.message === 'codex_request_identity_sealed_prefix_not_found') {
                throw new Error('forge_autonomous_policy_identity_drift');
            }
            throw error;
        }
    }
    throw lastSessionReadError ?? new Error('codex_request_identity_session_changed_during_read');
}
