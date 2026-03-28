import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateDistributions } from './distributions.js';

interface MarketplaceFile {
    name: string;
    interface?: {
        displayName?: string;
    };
    plugins: Array<{
        name: string;
        source: {
            source: 'local';
            path: string;
        };
        policy: {
            installation: 'AVAILABLE' | 'INSTALLED_BY_DEFAULT' | 'NOT_AVAILABLE';
            authentication: 'ON_INSTALL' | 'ON_USE';
        };
        category: string;
    }>;
}

export interface InstallOptions {
    projectRoot: string;
    homeDir?: string;
}

function resolveHomeDir(homeDir?: string): string {
    return path.resolve(homeDir ?? os.homedir());
}

function ensureGenerated(projectRoot: string): void {
    const mismatches = validateDistributions(projectRoot);
    if (mismatches.length > 0) {
        throw new Error(
            `Distribution artifacts are stale or missing. Run npm run build:distributions first.\n${mismatches.join('\n')}`,
        );
    }
}

function writeJsonFile(filePath: string, payload: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

function removePathIfExists(targetPath: string): void {
    if (!fs.existsSync(targetPath)) {
        return;
    }

    fs.rmSync(targetPath, { recursive: true, force: true });
}

export function installGeminiExtension(options: InstallOptions): { linkPath: string } {
    const projectRoot = path.resolve(options.projectRoot);
    const homeDir = resolveHomeDir(options.homeDir);
    const extensionRoot = path.join(homeDir, '.gemini', 'extensions');
    const linkPath = path.join(extensionRoot, 'corvus-star');

    ensureGenerated(projectRoot);
    fs.mkdirSync(extensionRoot, { recursive: true });

    if (fs.existsSync(linkPath)) {
        const stat = fs.lstatSync(linkPath);
        if (stat.isSymbolicLink()) {
            const currentTarget = fs.readlinkSync(linkPath);
            const resolvedTarget = path.resolve(path.dirname(linkPath), currentTarget);
            if (resolvedTarget === projectRoot) {
                return { linkPath };
            }
        }
        removePathIfExists(linkPath);
    }

    fs.symlinkSync(projectRoot, linkPath, 'dir');
    return { linkPath };
}

function buildCodexPluginMcpConfig(projectRoot: string): Record<string, unknown> {
    return {
        mcpServers: {
            pennyone: {
                command: 'node',
                args: ['bin/pennyone-mcp.js'],
                cwd: projectRoot,
                env: {
                    GEMINI_CLI_ACTIVE: 'true',
                },
                note: 'Authoritative Corvus Hall and PennyOne MCP surface.',
            },
            'corvus-control': {
                command: 'node',
                args: ['scripts/run-tsx.mjs', 'src/tools/corvus-control-mcp.ts'],
                cwd: projectRoot,
                env: {
                    GEMINI_CLI_ACTIVE: 'true',
                },
                note: 'Kernel-backed Corvus workflow and control-plane MCP surface.',
            },
        },
    };
}

function readMarketplaceFile(filePath: string): MarketplaceFile {
    if (!fs.existsSync(filePath)) {
        return {
            name: 'corvus-local',
            interface: {
                displayName: 'Corvus Local Plugins',
            },
            plugins: [],
        };
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MarketplaceFile;
}

export function installCodexPlugin(options: InstallOptions): { pluginPath: string; marketplacePath: string } {
    const projectRoot = path.resolve(options.projectRoot);
    const homeDir = resolveHomeDir(options.homeDir);
    const sourcePluginPath = path.join(projectRoot, 'plugins', 'corvus-star');
    const pluginPath = path.join(homeDir, 'plugins', 'corvus-star');
    const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');

    ensureGenerated(projectRoot);

    fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
    removePathIfExists(pluginPath);
    fs.cpSync(sourcePluginPath, pluginPath, { recursive: true });
    writeJsonFile(path.join(pluginPath, '.mcp.json'), buildCodexPluginMcpConfig(projectRoot));

    const marketplace = readMarketplaceFile(marketplacePath);
    const plugins = marketplace.plugins.filter((entry) => entry.name !== 'corvus-star');
    plugins.push({
        name: 'corvus-star',
        source: {
            source: 'local',
            path: './plugins/corvus-star',
        },
        policy: {
            installation: 'AVAILABLE',
            authentication: 'ON_INSTALL',
        },
        category: 'Developer Tools',
    });

    writeJsonFile(marketplacePath, {
        name: marketplace.name || 'corvus-local',
        interface: marketplace.interface ?? { displayName: 'Corvus Local Plugins' },
        plugins,
    });

    return {
        pluginPath,
        marketplacePath,
    };
}
