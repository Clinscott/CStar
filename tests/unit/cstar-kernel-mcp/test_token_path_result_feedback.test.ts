import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildHallRepositoryId, normalizeHallPath } from '../../../src/types/hall.js';
import { registerCoreTools } from '../../../src/tools/cstar-kernel-mcp/register_core_tools.js';
import { registry } from '../../../src/tools/pennyone/pathRegistry.js';
import {
    beadStore,
    handleRecordResult,
    seedValidationBead,
} from './shared_test_setup.js';

function seedRootBoundValidationBead(
    beadId: string,
    targetPath = 'src/validation-target.ts',
): void {
    seedValidationBead(beadId, targetPath);
    const bead = beadStore.get(beadId);
    bead.repo_id = buildHallRepositoryId(normalizeHallPath(registry.getRoot()));
}

describe('CStar generic result boundary excludes TokenPath', () => {
    it('does not infer or auto-record an observation from a bead result', async () => {
        const beadId = 'bead-token-path-no-auto-observation';
        seedRootBoundValidationBead(beadId, 'src/tools/cstar-kernel-mcp/telemetry/token_path.ts');

        const result = await handleRecordResult({
            bead_id: beadId,
            verdict: 'SUCCESS',
            notes: 'A validation result is not a measured TokenPath observation.',
        });
        const parsed = JSON.parse(result.content[0].text);

        assert.strictEqual(parsed.status, 'recorded_unverified');
        assert.strictEqual(parsed.stored_verdict, 'INCONCLUSIVE');
        assert.strictEqual(parsed.token_path_observation_status, undefined);
        assert.strictEqual(parsed.token_path_observation_id, undefined);
    });

    it('does not advertise TokenPath-shaped arguments on cstar_record_result', () => {
        const registrations: any[][] = [];
        registerCoreTools(
            { tool: (...args: any[]) => registrations.push(args) },
            (_name, handler) => handler,
        );
        const resultRegistration = registrations.find(([name]) => name === 'cstar_record_result');
        assert.ok(resultRegistration);
        const schema = resultRegistration[2] as Record<string, unknown>;

        assert.equal(Object.hasOwn(schema, 'token_path_episode_id'), false);
        assert.equal(Object.hasOwn(schema, 'token_path_observation'), false);
    });

    it('ignores legacy extra properties without emitting TokenPath response fields', async () => {
        const beadId = 'bead-token-path-legacy-extra';
        seedRootBoundValidationBead(beadId);
        const legacyArgs = {
            bead_id: beadId,
            verdict: 'SUCCESS',
            token_path_episode_id: 'legacy-episode',
            token_path_observation: { scenario_class: 'legacy' },
        } as any;

        const parsed = JSON.parse((await handleRecordResult(legacyArgs)).content[0].text);

        assert.equal(parsed.validation_persisted, true);
        assert.equal(Object.hasOwn(parsed, 'token_path_observation_status'), false);
        assert.equal(Object.hasOwn(parsed, 'token_path_observation_warning'), false);
        assert.equal(Object.hasOwn(parsed, 'token_path_observation_id'), false);
    });
});
