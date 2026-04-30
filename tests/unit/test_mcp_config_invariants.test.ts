import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function readJson(filePath: string): any {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, filePath), 'utf-8'));
}

function resolveMcpArg(configPath: string, arg: string): string {
    const config = readJson(configPath);
    const cwd = config.mcpServers?.['cstar-kernel']?.cwd;
    const configDir = path.dirname(path.join(PROJECT_ROOT, configPath));
    const baseDir = cwd
        ? path.resolve(configDir, cwd)
        : configDir;

    if (arg.includes('${extensionPath}')) {
        return arg.replace('${extensionPath}', PROJECT_ROOT);
    }
    if (path.isAbsolute(arg)) {
        return arg;
    }
    return path.resolve(baseDir, arg);
}

describe('MCP config invariants', () => {
    for (const configPath of ['.mcp.json', 'gemini-extension.json', 'plugins/corvus-star/.mcp.json']) {
        it(`${configPath} registers only cstar-kernel`, () => {
            const config = readJson(configPath);
            const servers = config.mcpServers ?? {};
            assert.deepEqual(Object.keys(servers), ['cstar-kernel']);

            const server = servers['cstar-kernel'];
            assert.equal(server.command, 'node');
            assert.ok(Array.isArray(server.args));
            assert.ok(server.args.length >= 1);

            const launcher = resolveMcpArg(configPath, server.args[0]);
            assert.equal(fs.existsSync(launcher), true, `${configPath} launcher missing: ${launcher}`);
            assert.equal(path.basename(launcher), 'cstar-kernel-mcp.js');
        });
    }
});
