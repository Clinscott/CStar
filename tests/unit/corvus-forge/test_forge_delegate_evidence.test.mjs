import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    fixedOAuthHorizon, initializeProviderJournal, providerJournalBinding,
    readProviderJournal, stableChildFailure,
} from '../../../.agents/skills/corvus-forge/scripts/forge_delegate_evidence.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const RUNTIME = path.join(ROOT, '.agents/skills/corvus-forge/runtime');
const DELEGATE = path.join(ROOT, '.agents/skills/corvus-forge/scripts/hermes_minimax_delegate.mjs');
const roots = [];
const identity = {
    forge_request_receipt_id: 'request-evidence-test',
    forge_execute_receipt_id: 'execute-evidence-test',
    decision_id: 'decision-evidence-test',
    adapter_ref: 'cstar-forge-hermes-minimax-worker-adapter',
};
const runtimeDigest = 'a'.repeat(64);

function fixture() {
    const root = fs.mkdtempSync(path.join(process.platform === 'linux' ? '/tmp' : os.tmpdir(),
        'cstar-forge-evidence-'));
    fs.chmodSync(root, 0o700); roots.push(root); return root;
}

function horizon(started = Date.now()) {
    return fixedOAuthHorizon(identity, runtimeDigest, {
        CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS: String(started),
        CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS: String(started + 2_100_000),
    });
}

function append(pathname, binding, states) {
    const code = [
        'import sys',
        'sys.path.insert(0, sys.argv[1])',
        'from hermes_cli.forge_provider_journal import append_provider_state',
        `states=${JSON.stringify(states)}`,
        '[append_provider_state(state) for state in states]',
    ].join(';');
    return spawnSync('/usr/bin/python3', ['-I', '-S', '-B', '-c', code, RUNTIME], {
        encoding: 'utf-8',
        env: {
            CSTAR_FORGE_PROVIDER_JOURNAL_PATH: pathname,
            CSTAR_FORGE_PROVIDER_JOURNAL_BINDING_SHA256: binding,
            PYTHONDONTWRITEBYTECODE: '1',
        },
    });
}

afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

describe('CStar Forge provider evidence', () => {
    it('proves the CStar-owned private runtime with a synthetic read-only OAuth fixture', () => {
        const root = fixture(); const home = path.join(root, 'home');
        const profile = path.join(home, '.hermes/profiles/cstar-hub');
        for (const directory of [home, path.join(home, '.hermes'), path.join(home, '.hermes/profiles'), profile]) {
            fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); fs.chmodSync(directory, 0o700);
        }
        const tokenCanary = 'synthetic-private-oauth-canary';
        const store = path.join(profile, 'auth.json');
        fs.writeFileSync(store, JSON.stringify({ providers: { 'minimax-oauth': {
            provider: 'minimax-oauth', region: 'global', portal_base_url: 'https://api.minimax.io',
            inference_base_url: 'https://api.minimax.io/anthropic',
            client_id: '78257093-7e40-4613-99e0-527b14b39113', token_type: 'Bearer',
            scope: 'group_id profile model.completion', access_token: tokenCanary,
            expires_at: '2099-01-01T00:00:00Z',
        } } }));
        fs.chmodSync(store, 0o600);
        const started = Date.now();
        const result = spawnSync(process.execPath, [DELEGATE, '--preflight'], {
            cwd: ROOT, encoding: 'utf-8', timeout: 10_000,
            env: {
                HOME: home, LANG: 'C.UTF-8',
                CSTAR_FORGE_HERMES_LOCATOR: path.join(RUNTIME, 'bin/hermes'),
                CSTAR_FORGE_REQUEST_RECEIPT_ID: identity.forge_request_receipt_id,
                CSTAR_FORGE_EXECUTE_RECEIPT_ID: identity.forge_execute_receipt_id,
                CSTAR_FORGE_EXECUTE_DECISION_ID: identity.decision_id,
                CSTAR_FORGE_EXECUTE_ADAPTER_REF: identity.adapter_ref,
                CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS: String(started),
                CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS: String(started + 2_100_000),
            },
        });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const proof = JSON.parse(result.stdout);
        assert.equal(proof.runtime_owner, 'cstar');
        assert.equal(proof.credential_profile_owner, 'hermes');
        assert.equal(proof.source_file_count, 5);
        assert.equal(proof.oauth_required_until_unix_ms, started + 2_100_000);
        assert.doesNotMatch(result.stdout + result.stderr, new RegExp(tokenCanary));
    });

    it('binds one fixed OAuth horizon to request, execution, adapter, and runtime identity', () => {
        const started = Date.now();
        const first = horizon(started); const second = horizon(started);
        assert.equal(first.required_until_unix_ms - first.horizon_started_unix_ms, 2_100_000);
        assert.equal(first.horizon_binding_sha256, second.horizon_binding_sha256);
        assert.match(first.horizon_binding_sha256, /^[a-f0-9]{64}$/);
        assert.throws(() => fixedOAuthHorizon(
            { ...identity, decision_id: 'decision-drift' }, runtimeDigest,
            {
                CSTAR_FORGE_OAUTH_HORIZON_STARTED_UNIX_MS: String(started),
                CSTAR_FORGE_OAUTH_REQUIRED_UNTIL_UNIX_MS: String(started + 2_100_001),
            },
        ), /forge_hermes_oauth_horizon_invalid/);
    });

    it('validates the Python child hash chain and distinguishes ambiguous from completed dispatch', () => {
        const root = fixture(); const fixed = horizon();
        const binding = providerJournalBinding(
            identity, runtimeDigest, fixed.horizon_binding_sha256, 'specifier', '1/6');
        const journal = initializeProviderJournal(root, binding, 'specifier', '1/6');
        const partial = append(journal, binding,
            ['capability_consumed', 'dispatch_attempted', 'request_sent']);
        assert.equal(partial.status, 0, partial.stderr);
        const partialEvidence = readProviderJournal(journal, binding);
        assert.deepEqual(
            [partialEvidence.started, partialEvidence.completed, partialEvidence.ambiguous],
            [1, 0, true],
        );
        assert.equal(partialEvidence.spend_observed, false);
        const headers = append(journal, binding, ['response_headers_received']);
        assert.equal(headers.status, 0, headers.stderr);
        const headerEvidence = readProviderJournal(journal, binding);
        assert.equal(headerEvidence.spend_observed, true);
        assert.deepEqual(
            [headerEvidence.started, headerEvidence.completed, headerEvidence.ambiguous],
            [1, 0, true],
        );
        const complete = append(journal, binding, ['response_body_complete']);
        assert.equal(complete.status, 0, complete.stderr);
        const completeEvidence = readProviderJournal(journal, binding);
        assert.deepEqual(
            [completeEvidence.started, completeEvidence.completed, completeEvidence.ambiguous],
            [1, 1, false],
        );
        assert.equal(completeEvidence.final_state, 'response_body_complete');
        assert.equal(completeEvidence.spend_observed, true);
        assert.match(completeEvidence.journal_sha256, /^[a-f0-9]{64}$/);
        assert.doesNotMatch(fs.readFileSync(journal, 'utf-8'), /token|bearer|prompt|response body/i);
    });

    it('treats missing or corrupt journal evidence as unknown and never forwards raw stderr', () => {
        const root = fixture(); const fixed = horizon();
        const binding = providerJournalBinding(
            identity, runtimeDigest, fixed.horizon_binding_sha256, 'specifier', '1/6');
        const journal = initializeProviderJournal(root, binding, 'specifier', '1/6');
        fs.appendFileSync(journal, '{"raw_secret":"canary"}\n');
        const evidence = readProviderJournal(journal, binding);
        assert.equal(evidence.valid, false); assert.equal(evidence.ambiguous, true);
        assert.equal(evidence.journal_sha256, null);
        assert.equal(stableChildFailure('forge_entrypoint_provider_request_failed\n', 1),
            'forge_entrypoint_provider_request_failed');
        assert.equal(stableChildFailure('secret canary\nsecond line', 23), 'forge_hermes_exit_23');
    });
});
