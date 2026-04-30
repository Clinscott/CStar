import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { installCodexPlugin } from '../src/packaging/installers.js';

const projectRoot = process.cwd();
const homeDir = os.homedir();
const codexConfigPath = path.join(homeDir, '.codex', 'config.toml');
const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');
const pluginKey = 'corvus-star@corvus-local';
const pluginName = 'corvus-star';
const stateLogPath = path.join(projectRoot, '.agents', 'state', 'codex-self-heal.jsonl');

interface HealthIssue {
    code: string;
    detail: string;
}

interface HealthSnapshot {
    ok: boolean;
    issues: HealthIssue[];
}

function readFileSafe(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return '';
    }
}

function hasCodexPluginEnabled(configText: string): boolean {
    const sectionPattern = new RegExp(`\\[plugins\\."${pluginKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\][\\s\\S]*?enabled\\s*=\\s*true`, 'm');
    return sectionPattern.test(configText);
}

function hasKernelServer(configText: string): boolean {
    return /\[mcp_servers\.cstar-kernel\]/.test(configText);
}

function hasKernelServerArgs(configText: string): boolean {
    return /\[mcp_servers\.cstar-kernel\][\s\S]*args\s*=\s*\["\/home\/morderith\/Corvus\/CStar\/bin\/cstar-kernel-mcp\.js"\]/m.test(configText);
}

function hasMarketplaceEntry(marketplaceText: string): boolean {
    return /"name":\s*"corvus-star"/.test(marketplaceText) && /"path":\s*"\.\/plugins\/corvus-star"/.test(marketplaceText);
}

function collectHealthSnapshot(): HealthSnapshot {
    const configText = readFileSafe(codexConfigPath);
    const marketplaceText = readFileSafe(marketplacePath);
    const issues: HealthIssue[] = [];

    if (!hasKernelServer(configText)) {
        issues.push({ code: 'missing_kernel_server', detail: 'missing cstar-kernel MCP config' });
    } else if (!hasKernelServerArgs(configText)) {
        issues.push({ code: 'unexpected_kernel_server_args', detail: 'cstar-kernel MCP config drifted from expected absolute launcher path' });
    }
    if (!hasCodexPluginEnabled(configText)) {
        issues.push({ code: 'plugin_disabled', detail: `plugin ${pluginKey} not enabled` });
    }
    if (!hasMarketplaceEntry(marketplaceText)) {
        issues.push({ code: 'missing_marketplace_entry', detail: 'corvus-star plugin missing from local marketplace' });
    }

    return {
        ok: issues.length === 0,
        issues,
    };
}

function appendStateLog(entry: Record<string, unknown>): void {
    try {
        fs.mkdirSync(path.dirname(stateLogPath), { recursive: true });
        fs.appendFileSync(stateLogPath, `${JSON.stringify(entry)}\n`, 'utf-8');
    } catch {
        // Logging must not break repair.
    }
}

function warn(message: string): void {
    console.error(`[corvus:codex:self-heal][warn] ${message}`);
}

function info(message: string): void {
    console.log(`[corvus:codex:self-heal] ${message}`);
}

function main(): void {
    const before = collectHealthSnapshot();
    if (before.ok) {
        appendStateLog({
            ts: new Date().toISOString(),
            status: 'healthy',
            repaired: false,
            issues: [],
        });
        info('Corvus Codex wiring healthy. No repair needed.');
        return;
    }

    warn(`Detected degraded Corvus Codex wiring: ${before.issues.map((issue) => issue.detail).join('; ')}`);
    const result = installCodexPlugin({ projectRoot });
    const after = collectHealthSnapshot();

    info(`Reinstalled local plugin at ${result.pluginPath}`);
    info(`Refreshed marketplace at ${result.marketplacePath}`);
    info(`Optional launcher refreshed at ${result.launcherPath}`);

    appendStateLog({
        ts: new Date().toISOString(),
        status: after.ok ? 'repaired' : 'degraded',
        repaired: true,
        issues_before: before.issues,
        issues_after: after.issues,
        plugin_path: result.pluginPath,
        marketplace_path: result.marketplacePath,
        launcher_path: result.launcherPath,
    });

    if (!after.ok) {
        warn(`Auto-repair incomplete: ${after.issues.map((issue) => issue.detail).join('; ')}`);
        process.exitCode = 1;
        return;
    }

    info(`Auto-repair complete. ${pluginName} is enabled and cstar-kernel is configured.`);
}

main();
