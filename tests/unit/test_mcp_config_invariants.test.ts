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
    for (const configPath of ['.mcp.json', 'gemini-extension.json']) {
        it(`${configPath} keeps its non-Codex host surface source-backed`, () => {
            const config = readJson(configPath);
            const servers = config.mcpServers ?? {};
            assert.deepEqual(Object.keys(servers), ['cstar-kernel']);

            const server = servers['cstar-kernel'];
            assert.equal(server.command, 'node');
            assert.ok(Array.isArray(server.args));
            assert.ok(server.args.length >= 1);
            assert.equal(
                server.env?.CSTAR_KERNEL_DISABLE_WATCH,
                '1',
                `${configPath} must disable source-watch auto-exit for host-launched MCP`,
            );

            const launcher = resolveMcpArg(configPath, server.args[0]);
            assert.equal(fs.existsSync(launcher), true, `${configPath} launcher missing: ${launcher}`);
            assert.equal(path.basename(launcher), 'cstar-kernel-mcp.js');
            assert.equal(
                launcher.includes(`${path.sep}dist${path.sep}`),
                false,
                `${configPath} must not route Codex/Gemini MCP through stale dist bundle artifacts`,
            );
        });
    }

    const estateProjectConfigPath = path.resolve(PROJECT_ROOT, '..', '.codex', 'config.toml');

    it('Corvus project config preserves Vercel without overriding the global Codex CStar registration', {
        skip: !fs.existsSync(estateProjectConfigPath) && 'standalone CStar checkout has no estate project config',
    }, () => {
        const configPath = estateProjectConfigPath;
        const config = fs.readFileSync(configPath, 'utf-8');

        assert.match(config, /^\[mcp_servers\.vercel\]$/m);
        assert.doesNotMatch(config, /^\[mcp_servers\.cstar-kernel(?:\.env)?\]$/m);
        assert.doesNotMatch(config, /GEMINI_CLI_ACTIVE/);
    });

    it('Corvus Star Codex plugin is skill-only', () => {
        const manifest = readJson('plugins/corvus-star/.codex-plugin/plugin.json');
        const pluginMcpPath = path.join(PROJECT_ROOT, 'plugins', 'corvus-star', '.mcp.json');
        const pluginHooksPath = path.join(PROJECT_ROOT, 'plugins', 'corvus-star', 'hooks');
        const legacyPluginHooksPath = path.join(PROJECT_ROOT, 'plugins', 'corvus-star', 'hooks.json');
        const hookScriptPath = path.join(PROJECT_ROOT, 'plugins', 'corvus-star', 'scripts', 'cstar_codex_post_write.sh');

        assert.equal(manifest.skills, './skills/');
        assert.equal('hooks' in manifest, false);
        assert.equal(fs.existsSync(pluginHooksPath), false);
        assert.equal(fs.existsSync(legacyPluginHooksPath), false);
        assert.equal(fs.existsSync(hookScriptPath), false);
        assert.equal('mcpServers' in manifest, false);
        assert.equal(fs.existsSync(pluginMcpPath), false);
    });

    it('Codex contract names the wrapper lineage and keeps source proof separate from activation', () => {
        const contract = fs.readFileSync(
            path.join(PROJECT_ROOT, 'docs', 'integrations', 'codex_mcp_contract.md'),
            'utf-8',
        );
        assert.match(contract, /global `cstar-kernel` entry in `~\/\.codex\/config\.toml`/);
        assert.match(contract, /cstar-kernel-mcp-wrapper/);
        assert.match(contract, /source-verified, not activated/);
        assert.match(contract, /direct stdio only/);
        assert.match(contract, /TCP mode and\s+`scripts\/cstar-mcp-tcp-daemon\.js` are retired and fail closed/);
        assert.match(contract, /no loopback\s+listener is an authorized CStar transport/);
        assert.match(contract, /newly spawned direct-stdio children are host-neutral/);
        assert.match(contract, /escalate after a bounded grace period/);
        assert.match(contract, /seed known Gemini, Codex, Claude, Droid,/);
        assert.match(contract, /TypeScript MCP entry reapplies that\s+neutralization after its dotenv load/);
        assert.match(contract, /explicit inactive sentinel resolves to `HEADLESS`/);
        assert.match(contract, /audited explicit key\s+set, not a `CODEX_\*` wildcard/);
        assert.match(contract, /unknown Codex variables may carry sandbox/);
        assert.match(contract, /`cstar_doctor` when kernel health is unknown/);
        assert.match(contract, /`cstar_handoff` when resuming prior/);
        assert.match(contract, /`cstar_augury` when route or material scope is ambiguous/);
        assert.match(contract, /None of these is a per-prompt ritual/);
        assert.doesNotMatch(contract, /npm run codex:(?:self-heal|smoke)/);
    });

    it('bin/cstar-kernel-mcp.js launches the TypeScript source surface through tsx', () => {
        const launcherPath = path.join(PROJECT_ROOT, 'bin', 'cstar-kernel-mcp.js');
        const launcher = fs.readFileSync(launcherPath, 'utf-8');

        assert.match(launcher, /node_modules['"], ['"]tsx['"], ['"]dist['"], ['"]loader\.mjs/);
        assert.match(launcher, /src['"], ['"]tools['"], ['"]cstar-kernel-mcp\.ts/);
        assert.doesNotMatch(launcher, /dist['"], ['"]cstar-kernel-mcp\.bundle\.js/);
    });
});
