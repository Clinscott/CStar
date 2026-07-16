import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startCodexCliActivity } from '../../src/core/codex_cli_activity.ts';
import { executeGenesisSequence } from '../../src/node/setup.ts';
import { installCodexPlugin, installGeminiExtension } from '../../src/packaging/installers.ts';

describe('Setup, packaging, and installation authority', () => {
    it('rejects direct host installation without touching the supplied home', () => {
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-install-authority-'));
        const before = fs.readdirSync(homeDir);
        assert.throws(
            () => installCodexPlugin({ projectRoot: process.cwd(), homeDir }),
            /direct_codex_plugin_install_retired_use_supported_codex_plugin_surface/,
        );
        assert.throws(
            () => installGeminiExtension({ projectRoot: process.cwd(), homeDir }),
            /direct_gemini_extension_install_retired_requires_supported_host_surface/,
        );
        assert.deepEqual(fs.readdirSync(homeDir), before);
        fs.rmSync(homeDir, { recursive: true, force: true });
    });

    it('rejects local setup before injected process or filesystem adapters', async () => {
        let processCalled = false;
        await assert.rejects(
            executeGenesisSequence('linux', () => {
                processCalled = true;
            }, new Proxy({}, {
                get() {
                    throw new Error('filesystem_adapter_must_not_be_touched');
                },
            })),
            /direct_local_setup_retired_requires_operator_gated_supported_installer/,
        );
        assert.equal(processCalled, false);
    });

    it('rejects the ambient Codex activity sidecar before file or timer effects', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-codex-activity-'));
        assert.throws(() => startCodexCliActivity({
            projectRoot: root,
            env: {},
            surface: 'delegation',
            cwd: root,
            command: 'synthetic',
            outputPath: path.join(root, 'output.json'),
        }), /legacy_codex_cli_activity_sidecar_retired_use_host_runtime_receipt/);
        assert.deepEqual(fs.readdirSync(root), []);
        fs.rmSync(root, { recursive: true, force: true });
    });
});
