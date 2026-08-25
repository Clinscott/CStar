import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const CSTAR_TARGET = '/home/morderith/Corvus/CStar/AGENTS.md';
export const TEST_BEAD_ID = 'bead:repair:test-exact-authorization';
export const TEST_DECISION_ID = 'decision:test-exact-authorization';
export const TEST_PACKAGE_LOCK_SHA256 = 'a'.repeat(64);

const roots: string[] = [];
const originalCodexHome = process.env.CODEX_HOME;
const secureTmp = process.platform === 'linux' ? '/tmp' : os.tmpdir();

export interface SessionOptions {
    threadId?: string;
    turnId?: string;
    timestamp?: string;
    textParts?: string[];
    sessionMeta?: Record<string, unknown>;
    repeatCanonicalSessionMeta?: boolean;
    duplicate?: boolean;
    laterUserText?: string;
    malformedOnly?: boolean;
}

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf-8').digest('hex');
}

export function createSession(options: SessionOptions = {}) {
    const codexHome = fs.mkdtempSync(path.join(secureTmp, 'cstar-operator-auth-'));
    roots.push(codexHome);
    const sessions = path.join(codexHome, 'sessions', '2026', '07', '12');
    fs.mkdirSync(sessions, { recursive: true, mode: 0o700 });
    const threadId = options.threadId ?? randomUUID();
    const turnId = options.turnId ?? randomUUID();
    const timestamp = options.timestamp ?? new Date().toISOString();
    const textParts = options.textParts ?? [
        'Corvus CStar 5.6. I authorize you to complete the audit in full. ',
        `Use exactly one CStar Forge execution through Hermes and M3 for ${TEST_BEAD_ID} and ${TEST_DECISION_ID}, `,
        `with zero retries, synthetic fixtures only, no live source collection, package-lock SHA-256 ${TEST_PACKAGE_LOCK_SHA256}, targeting exactly ${CSTAR_TARGET}.`,
    ];
    const content = textParts.map((text) => ({ type: 'input_text', text }));
    const canonicalContent = JSON.stringify(content);
    const messageSha256 = sha256(canonicalContent);
    const meta = {
        timestamp,
        type: 'session_meta',
        payload: {
            id: threadId,
            thread_source: 'user',
            parent_thread_id: null,
            agent_path: null,
            forked_from_id: null,
            ...options.sessionMeta,
        },
    };
    const user = {
        timestamp,
        type: 'response_item',
        payload: {
            type: 'message', role: 'user', content,
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
    };
    const rows = options.malformedOnly
        ? ['{"truncated":']
        : [JSON.stringify(meta), JSON.stringify(user)];
    if (options.repeatCanonicalSessionMeta && !options.malformedOnly) rows.push(JSON.stringify(meta));
    if (options.duplicate && !options.malformedOnly) rows.push(JSON.stringify(user));
    if (options.laterUserText && !options.malformedOnly) {
        rows.push(JSON.stringify({
            timestamp: new Date(Date.parse(timestamp) + 1_000).toISOString(),
            type: 'response_item',
            payload: {
                type: 'message', role: 'user',
                content: [{ type: 'input_text', text: options.laterUserText }],
                internal_chat_message_metadata_passthrough: { turn_id: randomUUID() },
            },
        }));
    }
    const sessionFile = path.join(sessions, `rollout-test-${threadId}.jsonl`);
    fs.writeFileSync(sessionFile, `${rows.join('\n')}\n`, { mode: 0o600 });
    process.env.CODEX_HOME = codexHome;
    return {
        codexHome, sessionFile, threadId, turnId, timestamp, messageSha256,
        reference: `codex-thread:${threadId}:turn:${turnId}:sha256:${messageSha256}`,
    };
}

export function appendUserMessage(
    sessionFile: string,
    turnId: string,
    text: string,
    timestamp: string,
): void {
    fs.appendFileSync(sessionFile, `${JSON.stringify({
        timestamp,
        type: 'response_item',
        payload: {
            type: 'message', role: 'user',
            content: [{ type: 'input_text', text }],
            internal_chat_message_metadata_passthrough: { turn_id: turnId },
        },
    })}\n`);
}

export function validScope(threadId: string) {
    return {
        caller_thread_id: threadId,
        caller_transport: 'direct-stdio',
        target_paths: [CSTAR_TARGET],
        requires_forge_hermes_m3: true,
        bead_id: TEST_BEAD_ID,
        decision_id: TEST_DECISION_ID,
        package_lock_sha256s: [TEST_PACKAGE_LOCK_SHA256],
        requires_zero_retries: true,
        requires_synthetic_fixtures_only: true,
        requires_no_live_source: true,
    } as const;
}

export function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

export function validRequestContext(threadId: string, turnId: string, overrides: Record<string, unknown> = {}) {
    return {
        _meta: {
            threadId,
            'x-codex-turn-metadata': {
                session_id: threadId, thread_id: threadId, turn_id: turnId,
                thread_source: 'user', parent_thread_id: null,
                forked_from_thread_id: null, subagent_kind: null,
                ...overrides,
            },
        },
        requestId: 7,
    };
}

export function cleanupOperatorAuthorizationFixtures(): void {
    if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = originalCodexHome;
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
}
