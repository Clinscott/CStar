import { afterEach, beforeEach, describe, it } from 'node:test';
import {
    assert,
    database,
    fs,
    handleAugury,
    handleRecordResult,
    os,
    path,
    seedValidationBead,
} from './shared_test_setup.js';
import { summarizeRecentTokenPathIntegration } from '../../../src/tools/cstar-kernel-mcp/telemetry/token_path.js';

const ADVICE_RELATIVE = path.join('.agents', 'state', 'augury-token-path-mcp-advice.jsonl');
const OBSERVATIONS_RELATIVE = path.join('.agents', 'state', 'augury-token-path-mcp-observations.jsonl');

describe('CStar MCP token-path feedback integrity', () => {
    let stateRoot = '';

    beforeEach(() => {
        stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-token-path-test-'));
        process.env.CSTAR_TOKEN_PATH_STATE_ROOT = stateRoot;
    });

    afterEach(() => {
        delete process.env.CSTAR_TOKEN_PATH_STATE_ROOT;
        fs.rmSync(stateRoot, { recursive: true, force: true });
    });

    it('keeps Augury shadow-only and performs no advice or observation writes', async () => {
        const result = await handleAugury({
            prompt: 'Patch one token-path telemetry test and run focused verification.',
            inferred_intent: 'REPAIR',
            target_paths: ['src/tools/cstar-kernel-mcp/telemetry/token_path.ts'],
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.token_path?.mode, 'shadow-disabled');
        assert.strictEqual(parsed.token_path?.shadow_only, true);
        assert.strictEqual(parsed.token_path?.actionable, false);
        assert.strictEqual(parsed.token_path?.episode_id, undefined);
        assert.strictEqual(parsed.token_path?.status, 'quarantined');
        assert.strictEqual(parsed.token_path?.confidence, undefined);
        assert.strictEqual(fs.existsSync(path.join(stateRoot, ADVICE_RELATIVE)), false);
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('does not auto-link an episode, bead, or target without an explicit observation', async () => {
        const beadId = `bead-token-path-no-link-${Date.now()}`;
        seedValidationBead(beadId);
        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            token_path_episode_id: 'mcp-tp-untrusted-correlation',
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded_unverified');
        assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(parsed.token_path_observation_warning, 'explicit_token_path_observation_required');
        assert.strictEqual(parsed.token_path_observation_id, undefined);
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('rejects sparse feedback instead of fabricating measured fields', async () => {
        const beadId = `bead-token-path-sparse-${Date.now()}`;
        seedValidationBead(beadId);
        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            token_path_observation: {
                scenario_class: 'REPAIR|test',
                selected_policy: 'none',
                advised_mode: 'shadow-disabled',
                terminal_outcome: 'completed-unverified',
            } as any,
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded_unverified');
        assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(parsed.token_path_observation_warning, 'malformed_token_path_observation_skipped');
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('quarantines explicit measurements while no promoted TokenPath episode source exists', async () => {
        const beadId = `bead-token-path-measured-${Date.now()}`;
        seedValidationBead(beadId);
        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            token_path_observation: {
                token_path_episode_id: 'mcp-tp-explicit-measurement',
                scenario_class: 'REPAIR|ambiguity:low|verification:no',
                selected_policy: 'none',
                advised_mode: 'shadow-disabled',
                observed_raw_tokens_episode: 1480,
                observed_billable_tokens_episode: 1340,
                rounds: 1,
                verification_result: 'not-run',
                terminal_outcome: 'completed-unverified',
            },
        });
        const parsed = JSON.parse(result.content[0].text);
        assert.strictEqual(parsed.status, 'recorded_unverified');
        assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(parsed.token_path_observation_source, 'explicit_payload');
        assert.strictEqual(parsed.token_path_observation_warning, 'token_path_quarantined_no_promoted_episode');
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('rejects contradictory outcomes and mismatched episode provenance', async () => {
        seedValidationBead('bead-token-path-contradictory');
        const contradictory = await handleRecordResult({
            bead_id: 'bead-token-path-contradictory',
            verdict: 'SUCCESS',
            token_path_observation: {
                token_path_episode_id: 'mcp-tp-contradictory',
                scenario_class: 'REPAIR|test',
                selected_policy: 'none',
                advised_mode: 'shadow-disabled',
                observed_raw_tokens_episode: 10,
                observed_billable_tokens_episode: 10,
                rounds: 1,
                verification_result: 'fail',
                terminal_outcome: 'verified-success',
            },
        });
        const contradictoryParsed = JSON.parse(contradictory.content[0].text);
        assert.strictEqual(contradictoryParsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(contradictoryParsed.token_path_observation_warning, 'malformed_token_path_observation_skipped');

        seedValidationBead('bead-token-path-mismatch');
        const mismatch = await handleRecordResult({
            bead_id: 'bead-token-path-mismatch',
            verdict: 'SUCCESS',
            token_path_episode_id: 'mcp-tp-top-level',
            token_path_observation: {
                token_path_episode_id: 'mcp-tp-payload',
                scenario_class: 'REPAIR|test',
                selected_policy: 'none',
                advised_mode: 'shadow-disabled',
                observed_raw_tokens_episode: 10,
                observed_billable_tokens_episode: 10,
                rounds: 1,
                verification_result: 'not-run',
                terminal_outcome: 'completed-unverified',
            },
        });
        const mismatchParsed = JSON.parse(mismatch.content[0].text);
        assert.strictEqual(mismatchParsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(mismatchParsed.token_path_observation_warning, 'token_path_episode_id_mismatch');
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('does not create orphan feedback when Hall validation persistence fails', async () => {
        seedValidationBead('bead-token-path-orphan-guard');
        const saveValidationRun = database.saveValidationRun as typeof database.saveValidationRun & {
            mock: { mockImplementationOnce: (implementation: () => never) => void };
        };
        saveValidationRun.mock.mockImplementationOnce(() => {
            throw new Error('simulated Hall write failure');
        });
        const result = await handleRecordResult({
            bead_id: 'bead-token-path-orphan-guard',
            verdict: 'SUCCESS',
            token_path_observation: {
                token_path_episode_id: 'mcp-tp-orphan-guard',
                scenario_class: 'REPAIR|test',
                selected_policy: 'none',
                advised_mode: 'shadow-disabled',
                observed_raw_tokens_episode: 10,
                observed_billable_tokens_episode: 10,
                rounds: 1,
                verification_result: 'not-run',
                terminal_outcome: 'completed-unverified',
            },
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'partial');
        assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(parsed.token_path_observation_warning, 'validation_not_persisted_observation_skipped');
        assert.strictEqual(fs.existsSync(path.join(stateRoot, OBSERVATIONS_RELATIVE)), false);
    });

    it('separates poisoned legacy ledgers from schema-v2 measured summaries', () => {
        const stateDir = path.join(stateRoot, '.agents', 'state');
        const now = new Date().toISOString();
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateRoot, ADVICE_RELATIVE), `${JSON.stringify({
            schema_version: '1.0.0',
            occurred_at: now,
            ts: now,
            episode_id: 'legacy-advice',
        })}\n`);
        fs.writeFileSync(path.join(stateRoot, OBSERVATIONS_RELATIVE), [
            { schema_version: '1.0.0', occurred_at: now, ts: now, actual_success: true },
            { schema_version: '2.0.0', occurred_at: now, ts: now, actual_success: false },
        ].map((row) => JSON.stringify(row)).join('\n') + '\n');

        const summary = summarizeRecentTokenPathIntegration();
        assert.strictEqual(summary.advisor_available, false);
        assert.strictEqual(summary.causal_calibration_ready, false);
        assert.strictEqual(summary.historical_ledger_trusted, false);
        assert.strictEqual(summary.historical_advice_count_24h, 1);
        assert.strictEqual(summary.historical_observation_count_24h, 2);
        assert.strictEqual(summary.historical_measured_observation_count_24h, 1);
        assert.strictEqual(summary.advice_count_24h, 0);
        assert.strictEqual(summary.observation_count_24h, 0);
        assert.strictEqual(summary.observed_success_rate, null);
    });
});
