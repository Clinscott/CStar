import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildDistributions, writeDistributions } from '../../src/packaging/distributions.js';
import { installCodexPlugin, installGeminiExtension } from '../../src/packaging/installers.js';

function createProjectRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-host-install-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version: '2.4.6',
            description: 'Kernel-first runtime.',
            homepage: 'https://example.com/cstar',
            repository: {
                url: 'https://example.com/cstar.git',
            },
            license: 'MIT',
            author: {
                name: 'Corvus Star',
            },
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify({
            entries: {
                hall: {
                    tier: 'PRIME',
                    description: 'Hall lookup',
                    runtime_trigger: 'hall',
                    host_support: {
                        gemini: 'native-session',
                        codex: 'exec-bridge',
                    },
                },
            },
        }, null, 2),
        'utf-8',
    );

    buildDistributions(root);
    writeDistributions(root);
    return root;
}

describe('distribution installers', () => {
    it('links the project root into the local Gemini extensions directory', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-gemini-'));

        const result = installGeminiExtension({ projectRoot, homeDir });
        const stat = fs.lstatSync(result.linkPath);

        assert.equal(stat.isSymbolicLink(), true);
        assert.equal(path.resolve(path.dirname(result.linkPath), fs.readlinkSync(result.linkPath)), projectRoot);
    });

    it('fails closed instead of copying Codex caches or mutating marketplace state', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-codex-'));

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /direct_codex_plugin_install_retired/,
        );
        assert.equal(fs.existsSync(path.join(homeDir, 'plugins')), false);
        assert.equal(fs.existsSync(path.join(homeDir, '.agents')), false);
    });
});
