import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function readJson(filePath: string): any {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8'));
}

describe('inactive host integration invariants', () => {
    for (const configPath of ['.mcp.json', 'gemini-extension.json']) {
        it(`${configPath} registers no MCP server`, () => {
            const config = readJson(configPath);
            assert.deepEqual(config.mcpServers ?? {}, {});
            assert.equal(JSON.stringify(config).includes('cstar-kernel-mcp.js'), false);
        });
    }

    it('keeps the archived Codex plugin undiscoverable and non-writing', () => {
        const pluginRoot = path.join(PROJECT_ROOT, 'plugins', 'corvus-star');
        const pluginManifest = readJson('plugins/corvus-star/.codex-plugin/plugin.json') as {
            skills?: unknown;
            mcpServers?: unknown;
            hooks?: unknown;
            interface?: { capabilities?: string[]; defaultPrompt?: string[] };
        };

        assert.equal(fs.existsSync(path.join(pluginRoot, '.mcp.json')), false);
        assert.equal(pluginManifest.skills, undefined);
        assert.equal(pluginManifest.mcpServers, undefined);
        assert.equal(pluginManifest.hooks, undefined);
        assert.deepEqual(pluginManifest.interface?.capabilities, ['Read']);
        assert.match(pluginManifest.interface?.defaultPrompt?.join(' ') ?? '', /Do not launch, install, or route work through CStar/);
    });

    it('advertises no local marketplace installation', () => {
        const marketplace = readJson('.agents/plugins/marketplace.json') as { plugins?: unknown[] };
        assert.deepEqual(marketplace.plugins, []);
    });

    it('retains the legacy launcher only as inspectable source', () => {
        const launcherPath = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js');
        assert.equal(fs.existsSync(launcherPath), true);
        const agents = fs.readFileSync(path.join(PROJECT_ROOT, 'AGENTS.md'), 'utf-8');
        assert.match(agents, /Do not launch or install `cstar-kernel`/);
    });
});
