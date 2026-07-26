import { describe, it } from 'node:test';
import {
    assert,
    beadStore,
    handleAugury,
    handleRecordResult,
    path,
} from './shared_test_setup.js';

describe('CStar MCP token-path result feedback', () => {
    it('auto-records an observation when Augury advice is linked by bead id', async () => {
        process.env.AUGURY_TOKEN_PATH_ROOT = path.join(process.cwd(), 'tests/fixtures/augury-token-path');
        const beadId = `bead-token-path-auto-${Date.now()}`;
        const auguryResult = await handleAugury({
            prompt: 'Patch one token-path telemetry test and run focused verification.',
            inferred_intent: 'REPAIR',
            target_paths: ['src/tools/cstar-kernel-mcp/telemetry/token_path.ts'],
            bead_id: beadId,
        });
        const auguryParsed = JSON.parse(auguryResult.content[0].text);
        assert.ok(auguryParsed.token_path?.episode_id, 'Augury must emit token-path advice for feedback test');

        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            notes: 'Bead-linked feedback should close the token-path loop.',
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded');
        assert.strictEqual(parsed.token_path_episode_id, auguryParsed.token_path.episode_id);
        assert.strictEqual(parsed.token_path_observation_status, 'recorded');
        assert.strictEqual(parsed.token_path_observation_source, 'auto_linked_recent_advice');
        assert.match(parsed.token_path_observation_id, /^mcp-obs-/);
    });

    it('auto-records an observation when Augury advice is linked by target path', async () => {
        process.env.AUGURY_TOKEN_PATH_ROOT = path.join(process.cwd(), 'tests/fixtures/augury-token-path');
        const beadId = `bead-token-path-target-${Date.now()}`;
        const targetPath = `src/tools/cstar-kernel-mcp/telemetry/token_path.${Date.now()}.ts`;
        const auguryResult = await handleAugury({
            prompt: 'Patch a token-path target and verify feedback telemetry.',
            inferred_intent: 'REPAIR',
            target_paths: [targetPath],
        });
        const auguryParsed = JSON.parse(auguryResult.content[0].text);
        assert.ok(auguryParsed.token_path?.episode_id, 'Augury must emit token-path advice for target feedback test');

        beadStore.set(beadId, {
            id: beadId,
            bead_id: beadId,
            repo_id: 'test-repo',
            target_path: targetPath,
            status: 'OPEN',
        });
        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            notes: 'Target-linked feedback should close the token-path loop.',
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded');
        assert.strictEqual(parsed.token_path_episode_id, auguryParsed.token_path.episode_id);
        assert.strictEqual(parsed.token_path_observation_status, 'recorded');
        assert.strictEqual(parsed.token_path_observation_source, 'auto_linked_recent_advice');
        assert.match(parsed.token_path_observation_id, /^mcp-obs-/);
    });

    it('warns explicitly when a supplied token-path episode id cannot be found', async () => {
        const result = await handleRecordResult({
            bead_id: `bead-token-path-missing-${Date.now()}`,
            verdict: 'SUCCESS',
            token_path_episode_id: 'mcp-tp-definitely-missing',
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded');
        assert.strictEqual(parsed.token_path_observation_status, 'not_recorded');
        assert.strictEqual(parsed.token_path_observation_warning, 'token_path_episode_id_not_found');
        assert.strictEqual(parsed.token_path_observation_id, undefined);
    });
});
