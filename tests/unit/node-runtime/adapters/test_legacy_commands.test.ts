import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    RETIRED_DYNAMIC_COMMAND_FAILURE,
    discoverLegacyCommands,
    loadSkillRegistryManifest,
    resolvePythonPath,
} from '../../../../src/node/core/runtime/adapters/legacy_commands.js';

describe('retired legacy command discovery', () => {
    it('returns no registry or filesystem commands even when executable-looking fixtures exist', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-retired-dynamic-'));
        try {
            fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
            fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
            fs.writeFileSync(
                path.join(root, '.agents', 'skill_registry.json'),
                JSON.stringify({ skills: { legacy: { entrypoint_path: 'scripts/legacy.py' } } }),
            );
            fs.writeFileSync(path.join(root, 'scripts', 'legacy.py'), 'raise SystemExit(99)\n');

            assert.deepEqual([...loadSkillRegistryManifest(root)], []);
            assert.deepEqual([...discoverLegacyCommands(root)], []);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('never resolves a Python interpreter for the retired lane', () => {
        assert.throws(
            () => resolvePythonPath('/synthetic'),
            { message: RETIRED_DYNAMIC_COMMAND_FAILURE },
        );
    });

    it('contains no filesystem, interpreter, or process dependency', () => {
        const source = fs.readFileSync(
            new URL('../../../../src/node/core/runtime/adapters/legacy_commands.ts', import.meta.url),
            'utf8',
        );
        assert.doesNotMatch(source, /node:fs|execa|getPythonPath|readFileSync|readdirSync|existsSync/);
    });
});
