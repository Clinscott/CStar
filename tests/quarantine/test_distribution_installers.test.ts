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
        path.join(root, '.agents', 'config.json'),
        JSON.stringify({
            system: {
                persona: 'O.D.I.N.',
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

function createPreparedCodexHome(): { homeDir: string; marketplacePath: string } {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-codex-'));
    const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(
        marketplacePath,
        `${JSON.stringify({
            name: 'corvus-local',
            plugins: [{
                name: 'corvus-star',
                source: { source: 'local', path: './plugins/corvus-star' },
                policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
                category: 'Developer Tools',
            }],
        }, null, 2)}\n`,
        'utf-8',
    );
    return { homeDir, marketplacePath };
}

describe('distribution installers', () => {
    it('rejects retired direct Gemini installation without host mutation', () => {
        const projectRoot = createProjectRoot();
        const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-home-gemini-'));
        const before = fs.readdirSync(homeDir);

        assert.throws(
            () => installGeminiExtension({ projectRoot, homeDir }),
            /direct_gemini_extension_install_retired_requires_supported_host_surface/,
        );
        assert.deepEqual(fs.readdirSync(homeDir), before);
    });

    it('stages the Codex plugin into a prepared marketplace without activation effects', () => {
        const projectRoot = createProjectRoot();
        const { homeDir, marketplacePath } = createPreparedCodexHome();
        const marketplaceBefore = fs.readFileSync(marketplacePath);

        const result = installCodexPlugin({ projectRoot, homeDir });
        assert.equal(result.pluginPath, path.join(homeDir, 'plugins', 'corvus-star'));
        assert.equal(fs.existsSync(path.join(result.pluginPath, 'lineage.json')), true);
        assert.equal(fs.existsSync(path.join(result.pluginPath, '.mcp.json')), false);
        assert.deepEqual(fs.readFileSync(marketplacePath), marketplaceBefore);
        assert.equal(fs.existsSync(path.join(homeDir, '.codex')), false);
    });
});
