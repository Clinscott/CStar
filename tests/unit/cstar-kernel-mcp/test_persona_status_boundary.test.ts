import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateRegistry } from '../../../src/node/core/state.ts';
import {
    buildStatusPersonaProjection,
    handleStatus,
} from '../../../src/tools/cstar-kernel-mcp/tools/status.ts';
import {
    resolvePersonaStyle,
} from '../../../src/tools/pennyone/personaRegistry.ts';
import {
    closeDb,
    upsertHallRepository,
} from '../../../src/tools/pennyone/intel/database.ts';
import { registry } from '../../../src/tools/pennyone/pathRegistry.ts';
import { buildPersonaProjectionMetadata } from '../../../src/tools/pennyone/persona_projection.ts';

describe('CStar status-only persona boundary', () => {
    let root: string;
    let originalRoot: string;
    let originalControlRoot: string | undefined;

    beforeEach(() => {
        originalRoot = registry.getRoot();
        originalControlRoot = process.env.CSTAR_CONTROL_ROOT;
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-persona-boundary-'));
        fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
        registry.setRoot(root);
        process.env.CSTAR_CONTROL_ROOT = root;
        closeDb();
    });

    afterEach(() => {
        closeDb();
        registry.setRoot(originalRoot);
        if (originalControlRoot === undefined) {
            delete process.env.CSTAR_CONTROL_ROOT;
        } else {
            process.env.CSTAR_CONTROL_ROOT = originalControlRoot;
        }
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('keeps the compatibility registry inert and free of config-file reads', () => {
        const source = fs.readFileSync(
            path.join(originalRoot, 'src', 'tools', 'pennyone', 'personaRegistry.ts'),
            'utf8',
        );

        assert.equal(resolvePersonaStyle(undefined), null);
        assert.equal(resolvePersonaStyle('ODIN'), null);
        assert.deepEqual(resolvePersonaStyle('O.D.I.N.'), {
            name: 'O.D.I.N.',
            prefix: '[O.D.I.N.]',
            loreFile: 'odin.qmd',
            authority: 'style_only',
        });
        assert.doesNotMatch(source, /readFile|existsSync|JSON\.parse|pathRegistry/);
        assert.doesNotMatch(source, /\.agents[\\/'\"]|config\.json/);
    });

    it('preserves a Hall-projected persona while legacy framework mutation fails closed', () => {
        upsertHallRepository({
            root_path: root,
            name: 'synthetic-cstar',
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: {
                source: 'synthetic-persona-boundary-test',
                ...buildPersonaProjectionMetadata('O.D.I.N.'),
            },
            created_at: 1,
            updated_at: 1,
        });

        assert.throws(
            () => StateRegistry.updateFramework({ active_task: 'bounded synthetic update' }),
            /legacy_state_registry_mutation_retired_use_cstar_kernel/,
        );

        assert.equal(StateRegistry.get().framework.active_persona, 'O.D.I.N.');
    });

    it('returns only the projected scalar and derives policy from it', async () => {
        upsertHallRepository({
            root_path: root,
            name: 'synthetic-cstar',
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: {
                source: 'synthetic-persona-boundary-test',
                ...buildPersonaProjectionMetadata('O.D.I.N.'),
            },
            created_at: 1,
            updated_at: 1,
        });

        const result = await handleStatus();
        const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;

        assert.equal(payload.persona, 'O.D.I.N.');
        assert.equal(payload.persona_projection_status, 'self_consistent_unverified');
        assert.equal((payload.framework as Record<string, unknown>).active_persona, undefined);
        assert.equal('tone_directive' in payload, false);
        assert.equal(JSON.stringify(payload).includes('config'), false);
    });

    it('returns an explicit freshness gap instead of a persona fallback', async () => {
        assert.deepEqual(buildStatusPersonaProjection(undefined), {
            persona: null,
            persona_projection_status: 'unavailable',
            persona_freshness_gap: 'active_persona_projection_unavailable',
        });
        const result = await handleStatus();
        const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
        assert.equal(payload.persona, null);
        assert.equal(payload.persona_projection_status, 'unavailable');
        assert.equal(payload.persona_freshness_gap, 'active_persona_projection_unavailable');
    });

    it('rejects a positive-timestamp migration persona at the cstar_status boundary', async () => {
        upsertHallRepository({
            root_path: root,
            name: 'synthetic-cstar',
            status: 'AWAKE',
            active_persona: 'O.D.I.N.',
            baseline_gungnir_score: 0,
            intent_integrity: 0,
            metadata: { source: 'migration' },
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_001,
        });

        const result = await handleStatus();
        const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
        assert.equal(payload.persona, null);
        assert.equal(payload.persona_projection_status, 'unavailable');
        assert.equal(payload.persona_freshness_gap, 'active_persona_projection_unavailable');
    });

    it('never echoes malformed or oversized persona canaries', () => {
        for (const invalid of ['ODIN', ' o.d.i.n. ', 'NOT-ODIN-ADMIN', 'O.D.I.N.\0CANARY', `O.D.I.N.${'X'.repeat(8_192)}`]) {
            const projection = buildStatusPersonaProjection(invalid, 'self_consistent_unverified');
            assert.deepEqual(projection, {
                persona: null,
                persona_projection_status: 'unavailable',
                persona_freshness_gap: 'active_persona_projection_unavailable',
            });
            assert.equal(JSON.stringify(projection).includes(invalid), false);
        }
    });
});
