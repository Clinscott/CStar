import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { executeGenesisSequence, getVenvBinaryPath } from '../../src/node/setup.js';

describe('Retired local setup boundary', () => {
    test('keeps platform path construction pure', () => {
        assert.equal(
            getVenvBinaryPath('win32', '/test/root', 'pip'),
            path.join('/test/root', '.venv', 'Scripts', 'pip.exe'),
        );
        assert.equal(
            getVenvBinaryPath('linux', '/test/root', 'pip').replace(/\\/g, '/'),
            '/test/root/.venv/bin/pip',
        );
        assert.equal(
            getVenvBinaryPath('darwin', '/test/root', 'pip').replace(/\\/g, '/'),
            '/test/root/.venv/bin/pip',
        );
    });

    test('pins an ABI-compatible Node line for macOS transfer', () => {
        const root = path.resolve(import.meta.dirname, '..', '..');
        const packageJson = JSON.parse(
            fs.readFileSync(path.join(root, 'package.json'), 'utf-8'),
        ) as { engines?: { node?: string } };

        assert.equal(packageJson.engines?.node, '>=22 <26');
        assert.equal(fs.readFileSync(path.join(root, '.nvmrc'), 'utf-8'), '24\n');
    });

    test('fails before filesystem, package, environment, or process effects', async () => {
        let execCalled = false;
        let fsCalled = false;
        const execAdapter = () => {
            execCalled = true;
        };
        const fsAdapter = new Proxy({}, {
            get() {
                fsCalled = true;
                throw new Error('filesystem_adapter_must_not_be_touched');
            },
        });

        await assert.rejects(
            executeGenesisSequence('linux', execAdapter, fsAdapter),
            /direct_local_setup_retired_requires_operator_gated_supported_installer/,
        );
        assert.equal(execCalled, false);
        assert.equal(fsCalled, false);
    });
});
