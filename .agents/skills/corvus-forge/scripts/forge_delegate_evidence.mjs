import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const JOURNAL_SCHEMA = 'cstar.forge_provider_journal.v1';
const JOURNAL_BINDING_SCHEMA = 'cstar.forge_provider_journal_binding.v1';
const HORIZON_BINDING_SCHEMA = 'cstar.forge_oauth_horizon_binding.v1';
const HORIZON_MS = 2_100_000;
const ZERO_DIGEST = '0'.repeat(64);
const STATES = ['not_reached', 'capability_consumed', 'dispatch_attempted', 'request_sent',
    'response_headers_received', 'response_body_complete'];
const EVENT_KEYS = ['binding_sha256', 'event_sha256', 'previous_sha256', 'schema', 'sequence', 'state'];

function digest(value) { return createHash('sha256').update(value).digest('hex'); }
function stableJson(value) {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort()
        .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
function validDigest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function journalEvent(binding, sequence, state, previous) {
    const base = { binding_sha256: binding, previous_sha256: previous,
        schema: JOURNAL_SCHEMA, sequence, state };
    return { ...base, event_sha256: digest(stableJson(base)) };
}
function safePrivateDirectory(root) {
    const stat = fs.lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== process.getuid?.()
        || (stat.mode & 0o077) !== 0) throw new Error('forge_hermes_private_evidence_root_invalid');
}

export function identityFromEnvironment(environment = process.env) {
    const identity = {
        forge_request_receipt_id: environment.CSTAR_FORGE_REQUEST_RECEIPT_ID,
        forge_execute_receipt_id: environment.CSTAR_FORGE_EXECUTE_RECEIPT_ID,
        decision_id: environment.CSTAR_FORGE_EXECUTE_DECISION_ID,
        adapter_ref: environment.CSTAR_FORGE_EXECUTE_ADAPTER_REF,
    };
    if (Object.values(identity).some((value) => typeof value !== 'string'
        || !/^[A-Za-z0-9._:/-]{1,200}$/.test(value))
        || identity.adapter_ref !== 'cstar-forge-hermes-minimax-worker-adapter') {
        throw new Error('forge_hermes_execution_identity_invalid');
    }
    return identity;
}

export function fixedOAuthHorizon(identity, runtimeContentSha256, environment = process.env) {
    if (!validDigest(runtimeContentSha256)) throw new Error('forge_hermes_oauth_horizon_invalid');
    const rawStarted = environment.CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS;
    const rawRequired = environment.CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS;
    if (!/^[0-9]{13}$/.test(rawStarted ?? '') || !/^[0-9]{13}$/.test(rawRequired ?? '')) {
        throw new Error('forge_hermes_oauth_horizon_required');
    }
    const horizonStartedUnixMs = Number(rawStarted);
    const requiredUntilUnixMs = Number(rawRequired);
    const now = Date.now();
    if (!Number.isSafeInteger(horizonStartedUnixMs) || !Number.isSafeInteger(requiredUntilUnixMs)
        || requiredUntilUnixMs - horizonStartedUnixMs !== HORIZON_MS
        || horizonStartedUnixMs > now + 10_000 || requiredUntilUnixMs <= now) {
        throw new Error('forge_hermes_oauth_horizon_invalid');
    }
    const binding = { schema: HORIZON_BINDING_SCHEMA, ...identity,
        runtime_content_sha256: runtimeContentSha256,
        horizon_started_unix_ms: horizonStartedUnixMs,
        required_until_unix_ms: requiredUntilUnixMs };
    return { ...binding, horizon_binding_sha256: digest(stableJson(binding)) };
}

export function horizonEnvironment(horizon) {
    return {
        CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS: String(horizon.horizon_started_unix_ms),
        CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS: String(horizon.required_until_unix_ms),
        CSTAR_FORGE_OAUTH_HORIZON_BINDING_SHA256: horizon.horizon_binding_sha256,
    };
}

export function providerJournalBinding(identity, runtimeContentSha256, horizonBindingSha256, role, phase) {
    const value = { schema: JOURNAL_BINDING_SCHEMA, ...identity,
        runtime_content_sha256: runtimeContentSha256, forge_role: role, forge_phase: phase,
        horizon_binding_sha256: horizonBindingSha256 };
    return digest(stableJson(value));
}

export function initializeProviderJournal(root, binding, role, phase) {
    safePrivateDirectory(root);
    if (!validDigest(binding) || !/^[a-z]+$/.test(role) || !/^[1-6]\/6$/.test(phase)) {
        throw new Error('forge_hermes_provider_journal_invalid');
    }
    const candidate = path.join(root, `provider-${phase[0]}-${role}.jsonl`);
    const item = journalEvent(binding, 0, STATES[0], ZERO_DIGEST);
    const descriptor = fs.openSync(candidate, fs.constants.O_WRONLY | fs.constants.O_CREAT
        | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0), 0o600);
    try { fs.writeFileSync(descriptor, `${stableJson(item)}\n`, 'ascii'); fs.fsyncSync(descriptor); }
    finally { fs.closeSync(descriptor); }
    return candidate;
}

function invalidEvidence(binding) {
    return { binding_sha256: binding, final_state: 'invalid_or_missing', journal_sha256: null,
        valid: false, started: 0, completed: 0, ambiguous: true,
        spend_observed: false, synthetic: false };
}

export function readProviderJournal(candidate, binding, options = {}) {
    let raw; let stat;
    try {
        const lexical = fs.lstatSync(candidate);
        if (lexical.isSymbolicLink() || !lexical.isFile() || lexical.nlink !== 1
            || lexical.uid !== process.getuid?.() || (lexical.mode & 0o777) !== 0o600
            || lexical.size <= 0 || lexical.size > 64 * 1024) return invalidEvidence(binding);
        const descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
        try { stat = fs.fstatSync(descriptor); raw = fs.readFileSync(descriptor); }
        finally { fs.closeSync(descriptor); }
        if (stat.dev !== lexical.dev || stat.ino !== lexical.ino || stat.size !== lexical.size) {
            return invalidEvidence(binding);
        }
    } catch { return invalidEvidence(binding); }
    let events;
    try { events = raw.toString('ascii').trim().split('\n').map((line) => JSON.parse(line)); }
    catch { return invalidEvidence(binding); }
    if (events.length < 1 || events.length > STATES.length) return invalidEvidence(binding);
    let previous = ZERO_DIGEST;
    for (let sequence = 0; sequence < events.length; sequence += 1) {
        const item = events[sequence];
        const expected = journalEvent(binding, sequence, STATES[sequence], previous);
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).sort().join(',') !== EVENT_KEYS.join(',')
            || stableJson(item) !== stableJson(expected)) return invalidEvidence(binding);
        previous = item.event_sha256;
    }
    if (options.synthetic === true && events.length === 1) {
        const completed = options.status === 0 ? 1 : 0;
        return { binding_sha256: binding,
            final_state: completed ? 'synthetic_response_complete' : 'synthetic_dispatch_ambiguous',
            journal_sha256: digest(raw), valid: true, started: 1, completed,
            ambiguous: completed === 0, spend_observed: completed === 1, synthetic: true };
    }
    const finalIndex = events.length - 1;
    const started = finalIndex >= STATES.indexOf('dispatch_attempted') ? 1 : 0;
    const completed = finalIndex >= STATES.indexOf('response_body_complete') ? 1 : 0;
    const spendObserved = finalIndex >= STATES.indexOf('response_headers_received');
    return { binding_sha256: binding, final_state: STATES[finalIndex], journal_sha256: digest(raw),
        valid: true, started, completed, ambiguous: started > completed,
        spend_observed: spendObserved, synthetic: false };
}

export function stableChildFailure(stderr, status) {
    const value = String(stderr ?? '').trim();
    if (/^forge_[a-z0-9_]{1,113}$/.test(value)) return value;
    return Number.isInteger(status) ? `forge_hermes_exit_${status}` : 'forge_hermes_invocation_failed';
}
