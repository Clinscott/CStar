import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { writeDistributions } from '../../src/packaging/distributions.js';
import { installCodexPlugin } from '../../src/packaging/installers.js';

function createProjectRoot(version = '2.4.6'): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-plugin-source-'));
    fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            name: 'corvusstar',
            version,
            description: 'Kernel-first runtime.',
            homepage: 'https://example.com/cstar',
            repository: { url: 'https://example.com/cstar.git' },
            license: 'MIT',
            author: { name: 'Corvus Star' },
        }, null, 2),
        'utf-8',
    );
    fs.writeFileSync(
        path.join(root, '.agents', 'skill_registry.json'),
        JSON.stringify({
            entries: {
                closeout: {
                    tier: 'SKILL',
                    description: 'Closeout',
                    runtime_trigger: 'cstar-closeout',
                    execution: { ownership_model: 'host-workflow' },
                    host_support: { codex: 'native-session', gemini: 'native-session' },
                },
            },
        }, null, 2),
        'utf-8',
    );
    writeDistributions(root);
    return root;
}

function createHome(): { homeDir: string; marketplacePath: string } {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-plugin-home-'));
    const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(
        marketplacePath,
        `${JSON.stringify({
            name: 'corvus-local',
            plugins: [
                {
                    name: 'corvus-star',
                    source: { source: 'local', path: './plugins/corvus-star' },
                    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
                    category: 'Developer Tools',
                },
            ],
        }, null, 2)}\n`,
        'utf-8',
    );
    return { homeDir, marketplacePath };
}

function snapshot(root: string, current = root): Record<string, string> {
    const records: Array<[string, string]> = [];
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            records.push(...Object.entries(snapshot(root, absolutePath)));
        } else if (entry.isFile()) {
            records.push([
                path.relative(root, absolutePath).split(path.sep).join('/'),
                createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
            ]);
        }
    }
    return Object.fromEntries(records.sort(([left], [right]) => left.localeCompare(right)));
}

describe('Codex plugin source staging', () => {
    it('atomically stages a byte-identical lineage-bound plugin and is idempotent', () => {
        const projectRoot = createProjectRoot();
        const { homeDir, marketplacePath } = createHome();
        const marketplaceBefore = fs.readFileSync(marketplacePath);

        const first = installCodexPlugin({ projectRoot, homeDir });
        const second = installCodexPlugin({ projectRoot, homeDir });

        assert.equal(first.changed, true);
        assert.equal(second.changed, false);
        assert.deepEqual(
            snapshot(first.pluginPath),
            snapshot(path.join(projectRoot, 'plugins', 'corvus-star')),
        );
        assert.deepEqual(fs.readFileSync(marketplacePath), marketplaceBefore);
        assert.equal(fs.existsSync(path.join(first.pluginPath, 'lineage.json')), true);
        assert.equal(fs.existsSync(path.join(first.pluginPath, '.mcp.json')), false);
        assert.equal(
            fs.readdirSync(path.dirname(first.pluginPath)).some((entry) => entry.startsWith('.corvus-star.')),
            false,
        );
    });

    it('fails closed on same-version lineage drift and on a missing marketplace', () => {
        const projectRoot = createProjectRoot();
        const { homeDir } = createHome();
        const staged = installCodexPlugin({ projectRoot, homeDir });
        const lineagePath = path.join(staged.pluginPath, 'lineage.json');
        const lineage = JSON.parse(fs.readFileSync(lineagePath, 'utf-8')) as {
            tool_catalog: { sha256: string };
        };
        lineage.tool_catalog.sha256 = '0'.repeat(64);
        fs.writeFileSync(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf-8');
        const before = snapshot(staged.pluginPath);

        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir }),
            /same-version Corvus Star plugin replacement.*different lineage/,
        );
        assert.deepEqual(snapshot(staged.pluginPath), before);

        const missingHome = fs.mkdtempSync(path.join(os.tmpdir(), 'corvus-plugin-no-marketplace-'));
        assert.throws(
            () => installCodexPlugin({ projectRoot, homeDir: missingHome }),
            /Personal Codex marketplace source entry is not prepared/,
        );
        assert.equal(fs.existsSync(path.join(missingHome, 'plugins', 'corvus-star')), false);
    });
});
