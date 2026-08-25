import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { validateDistributions } from './distributions.js';
import {
    assertManagedPathSafe,
    assertRegularTree,
    compareStrictSemver,
    listRegularFiles,
    parseStrictSemver,
    resolveCanonicalDirectory,
} from './packaging_safety.js';

interface PluginLineage {
    schema_version: 1;
    plugin: {
        name: string;
        version: string;
    };
    runtime_binding: {
        integration_mode: string;
        kernel_bundled: boolean;
    };
    files: Record<string, {
        bytes: number;
        sha256: string;
    }>;
}

export interface InstallOptions {
    projectRoot: string;
    homeDir?: string;
}

export interface CodexPluginInstallResult {
    pluginPath: string;
    marketplacePath: string;
    changed: boolean;
}

function resolveHomeDir(homeDir?: string): string {
    return resolveCanonicalDirectory(homeDir ?? os.homedir(), 'Host home directory');
}

function ensureGenerated(projectRoot: string): void {
    const mismatches = validateDistributions(projectRoot);
    if (mismatches.length > 0) {
        throw new Error(
            `Distribution artifacts are stale or missing. Run npm run build:distributions first.\n${mismatches.join('\n')}`,
        );
    }
}

function sha256(content: Buffer | string): string {
    return createHash('sha256').update(content).digest('hex');
}

function removePathIfExists(targetPath: string): void {
    if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
    }
}

function isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
}

function acquireInstallLock(pluginParent: string): () => void {
    const lockPath = path.join(pluginParent, '.corvus-star.install.lock');
    const token = `${process.pid}-${Date.now()}-${process.hrtime.bigint()}`;
    const payload = `${JSON.stringify({ pid: process.pid, token, created_at: new Date().toISOString() })}\n`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const descriptor = fs.openSync(lockPath, 'wx', 0o600);
            try {
                fs.writeFileSync(descriptor, payload, 'utf-8');
            } finally {
                fs.closeSync(descriptor);
            }
            return () => {
                if (!fs.existsSync(lockPath)) return;
                const stat = fs.lstatSync(lockPath);
                if (stat.isSymbolicLink() || !stat.isFile()) {
                    throw new Error(`Corvus Star install lock changed type while held: ${lockPath}`);
                }
                const current = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as { token?: unknown };
                if (current.token !== token) {
                    throw new Error(`Corvus Star install lock ownership changed while held: ${lockPath}`);
                }
                fs.rmSync(lockPath, { force: true });
            };
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code !== 'EEXIST') throw error;
            const stat = fs.lstatSync(lockPath);
            if (stat.isSymbolicLink() || !stat.isFile()) {
                throw new Error(`Corvus Star install lock is not a regular file: ${lockPath}`);
            }
            let owner: { pid?: unknown };
            try {
                owner = JSON.parse(fs.readFileSync(lockPath, 'utf-8')) as { pid?: unknown };
            } catch (parseError) {
                throw new Error(`Corvus Star install lock is unreadable; preserve it for recovery: ${lockPath}`, { cause: parseError });
            }
            if (typeof owner.pid === 'number' && isProcessAlive(owner.pid)) {
                throw new Error(`Another Corvus Star plugin install is active under pid ${owner.pid}: ${lockPath}`);
            }
            fs.rmSync(lockPath, { force: true });
        }
    }
    throw new Error(`Unable to acquire Corvus Star install lock: ${lockPath}`);
}

function assertNoOrphanInstallArtifacts(pluginParent: string): void {
    const orphans = fs.readdirSync(pluginParent)
        .filter((entry) => entry.startsWith('.corvus-star.stage-') || entry.startsWith('.corvus-star.rollback-'))
        .sort((left, right) => left.localeCompare(right));
    if (orphans.length > 0) {
        throw new Error(
            `Unresolved Corvus Star install recovery artifacts require operator review: ${orphans.map((entry) => path.join(pluginParent, entry)).join(', ')}`,
        );
    }
}

function readPluginVersion(pluginRoot: string): string | undefined {
    const manifestPath = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
    if (!fs.existsSync(manifestPath)) {
        return undefined;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { version?: unknown };
    if (manifest.version === undefined) return undefined;
    return parseStrictSemver(manifest.version, 'plugin manifest version').raw;
}

function readPluginLineage(pluginRoot: string): { content: string; lineage: PluginLineage } {
    const lineagePath = path.join(pluginRoot, 'lineage.json');
    const content = fs.readFileSync(lineagePath, 'utf-8');
    const lineage = JSON.parse(content) as PluginLineage;
    if (
        lineage.schema_version !== 1
        || lineage.plugin?.name !== 'corvus-star'
        || typeof lineage.plugin.version !== 'string'
        || !lineage.files
        || typeof lineage.files !== 'object'
    ) {
        throw new Error(`Invalid Corvus Star plugin lineage: ${lineagePath}`);
    }
    parseStrictSemver(lineage.plugin.version, 'plugin lineage version');
    return { content, lineage };
}

function resolveLineageFile(pluginRoot: string, relativePath: string): string {
    const root = path.resolve(pluginRoot);
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(`${root}${path.sep}`)) {
        throw new Error(`Plugin lineage path escapes plugin root: ${relativePath}`);
    }
    return absolutePath;
}

function validatePluginTree(pluginRoot: string, lineage: PluginLineage): void {
    assertRegularTree(pluginRoot, 'Corvus Star plugin tree');
    if (
        lineage.runtime_binding?.integration_mode !== 'skill-only'
        || lineage.runtime_binding?.kernel_bundled !== false
    ) {
        throw new Error('Codex plugin lineage must declare skill-only with no bundled kernel.');
    }
    if (readPluginVersion(pluginRoot) !== lineage.plugin.version) {
        throw new Error('Codex plugin manifest version does not match lineage version.');
    }

    const expectedFiles = Object.keys(lineage.files).sort((left, right) => left.localeCompare(right));
    const actualFiles = listRegularFiles(pluginRoot).filter((file) => file !== 'lineage.json');
    if (actualFiles.includes('.mcp.json')) {
        throw new Error('Codex plugin must not contain .mcp.json.');
    }
    if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
        throw new Error('Codex plugin file set does not match lineage.');
    }

    for (const relativePath of expectedFiles) {
        const record = lineage.files[relativePath];
        if (!record || !Number.isInteger(record.bytes) || !/^[a-f0-9]{64}$/.test(record.sha256)) {
            throw new Error(`Invalid plugin lineage record: ${relativePath}`);
        }
        const content = fs.readFileSync(resolveLineageFile(pluginRoot, relativePath));
        if (content.length !== record.bytes || sha256(content) !== record.sha256) {
            throw new Error(`Codex plugin content does not match lineage: ${relativePath}`);
        }
    }
}

function readMarketplaceFile(filePath: string): unknown {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateMarketplaceEntry(filePath: string): void {
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Personal Codex marketplace source entry is not prepared at ${filePath}. Prepare it separately before staging the plugin source.`,
        );
    }
    const marketplace = readMarketplaceFile(filePath);
    if (
        !isRecord(marketplace)
        || typeof marketplace.name !== 'string'
        || !marketplace.name.trim()
        || !Array.isArray(marketplace.plugins)
    ) {
        throw new Error(`Personal Codex marketplace has an invalid root schema: ${filePath}`);
    }
    const entries = marketplace.plugins.filter(
        (entry): entry is Record<string, unknown> => isRecord(entry) && entry.name === 'corvus-star',
    );
    const entry = entries[0];
    if (entries.length !== 1 || !entry || !isRecord(entry.source)) {
        throw new Error(
            `Personal Codex marketplace must contain exactly one local corvus-star entry at ./plugins/corvus-star: ${filePath}`,
        );
    }
    if (entry.source.source !== 'local' || entry.source.path !== './plugins/corvus-star') {
        throw new Error(
            `Personal Codex marketplace must contain exactly one local corvus-star entry at ./plugins/corvus-star: ${filePath}`,
        );
    }
    if (
        !isRecord(entry.policy)
        || !['AVAILABLE', 'INSTALLED_BY_DEFAULT'].includes(String(entry.policy.installation))
        || !['ON_INSTALL', 'ON_USE'].includes(String(entry.policy.authentication))
        || typeof entry.category !== 'string'
        || !entry.category.trim()
    ) {
        throw new Error(
            `Personal Codex marketplace corvus-star entry is unavailable or has invalid policy/category metadata: ${filePath}`,
        );
    }
}

/** @deprecated Host-global Gemini installation requires a supported host surface. */
export function installGeminiExtension(_options: InstallOptions): never {
    throw new Error(
        'direct_gemini_extension_install_retired_requires_supported_host_surface',
    );
}

/**
 * Stage verified Codex plugin source into a prepared personal marketplace.
 * The compatibility name is retained, but this does not install or activate
 * the plugin and never mutates marketplace or Codex cache state.
 */
export function installCodexPlugin(options: InstallOptions): CodexPluginInstallResult {
    const projectRoot = resolveCanonicalDirectory(options.projectRoot, 'CStar project root');
    const homeDir = resolveHomeDir(options.homeDir);
    const sourcePluginPath = path.join(projectRoot, 'plugins', 'corvus-star');
    const pluginPath = path.join(homeDir, 'plugins', 'corvus-star');
    const marketplacePath = path.join(homeDir, '.agents', 'plugins', 'marketplace.json');
    const pluginParent = path.dirname(pluginPath);

    ensureGenerated(projectRoot);
    assertManagedPathSafe(projectRoot, sourcePluginPath, 'Generated Corvus Star plugin source');
    assertRegularTree(sourcePluginPath, 'Generated Corvus Star plugin source');
    assertManagedPathSafe(homeDir, marketplacePath, 'Personal Codex marketplace');
    if (fs.existsSync(marketplacePath) && !fs.lstatSync(marketplacePath).isFile()) {
        throw new Error(`Personal Codex marketplace must be a regular file: ${marketplacePath}`);
    }
    const source = readPluginLineage(sourcePluginPath);
    validatePluginTree(sourcePluginPath, source.lineage);
    validateMarketplaceEntry(marketplacePath);
    assertManagedPathSafe(homeDir, pluginParent, 'Personal Codex plugin root');
    assertManagedPathSafe(homeDir, pluginPath, 'Corvus Star plugin destination');
    if (fs.existsSync(pluginPath)) {
        assertRegularTree(pluginPath, 'Installed Corvus Star plugin');
    }

    fs.mkdirSync(pluginParent, { recursive: true });
    const releaseInstallLock = acquireInstallLock(pluginParent);

    try {
        assertNoOrphanInstallArtifacts(pluginParent);
        const installedVersion = fs.existsSync(pluginPath) ? readPluginVersion(pluginPath) : undefined;

        if (installedVersion === source.lineage.plugin.version) {
            let installed: { content: string; lineage: PluginLineage };
            try {
                installed = readPluginLineage(pluginPath);
            } catch (error) {
                throw new Error(
                    `Refusing same-version Corvus Star plugin replacement: installed ${source.lineage.plugin.version} has missing or invalid lineage.`,
                    { cause: error },
                );
            }
            if (sha256(installed.content) !== sha256(source.content)) {
                throw new Error(
                    `Refusing same-version Corvus Star plugin replacement: ${source.lineage.plugin.version} has different lineage. Bump the plugin version before installing changed content.`,
                );
            }
            try {
                validatePluginTree(pluginPath, installed.lineage);
            } catch (error) {
                throw new Error(
                    `Refusing same-version Corvus Star plugin replacement: installed ${source.lineage.plugin.version} content drifted from its lineage.`,
                    { cause: error },
                );
            }
            return {
                pluginPath,
                marketplacePath,
                changed: false,
            };
        }

        if (
            installedVersion !== undefined
            && compareStrictSemver(source.lineage.plugin.version, installedVersion) < 0
        ) {
            throw new Error(
                `Refusing Corvus Star plugin downgrade from ${installedVersion} to ${source.lineage.plugin.version}.`,
            );
        }

        const stagingRoot = fs.mkdtempSync(path.join(pluginParent, '.corvus-star.stage-'));
        const stagedPluginPath = path.join(stagingRoot, 'corvus-star');
        const rollbackRoot = fs.mkdtempSync(path.join(pluginParent, '.corvus-star.rollback-'));
        const rollbackPluginPath = path.join(rollbackRoot, 'corvus-star');
        let previousMoved = false;
        let stagedInstalled = false;
        let preserveRollback = false;

        try {
            fs.cpSync(sourcePluginPath, stagedPluginPath, { recursive: true });
            const staged = readPluginLineage(stagedPluginPath);
            validatePluginTree(stagedPluginPath, staged.lineage);
            if (sha256(staged.content) !== sha256(source.content)) {
                throw new Error('Staged Corvus Star plugin lineage differs from source.');
            }

            if (fs.existsSync(pluginPath)) {
                fs.renameSync(pluginPath, rollbackPluginPath);
                previousMoved = true;
            }
            fs.renameSync(stagedPluginPath, pluginPath);
            stagedInstalled = true;
            const installed = readPluginLineage(pluginPath);
            validatePluginTree(pluginPath, installed.lineage);
        } catch (error) {
            const recoveryErrors: unknown[] = [];
            if (stagedInstalled) {
                try {
                    removePathIfExists(pluginPath);
                } catch (recoveryError) {
                    recoveryErrors.push(recoveryError);
                }
            }
            if (previousMoved && fs.existsSync(rollbackPluginPath)) {
                try {
                    fs.renameSync(rollbackPluginPath, pluginPath);
                    previousMoved = false;
                } catch (recoveryError) {
                    recoveryErrors.push(recoveryError);
                }
            }
            if (recoveryErrors.length > 0) {
                preserveRollback = true;
                throw new Error(
                    `Corvus Star plugin replacement failed and rollback was incomplete. Recovery copy preserved at ${rollbackPluginPath}`,
                    { cause: new AggregateError([error, ...recoveryErrors]) },
                );
            }
            throw error;
        } finally {
            removePathIfExists(stagingRoot);
            if (!preserveRollback) {
                removePathIfExists(rollbackRoot);
            }
        }

        return {
            pluginPath,
            marketplacePath,
            changed: true,
        };
    } finally {
        releaseInstallLock();
    }
}
