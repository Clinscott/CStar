import fs from 'node:fs';
import path from 'node:path';

import { readBoundedJsonObject } from '../core/safe_local_file.js';

import {
    buildCodexPluginManifestContent,
    buildCodexPluginSkillContent,
    buildDistributionReadmeContent,
    buildGeminiContextContent,
    buildGeminiManifestContent,
    buildMarketplaceContent,
} from './distribution_content.js';

export type HostProvider = 'gemini' | 'codex' | 'claude';
export type HostSupportStatus =
    | 'supported'
    | 'native-session'
    | 'exec-bridge'
    | 'policy-only'
    | 'unsupported'
    | 'unknown';

interface RegistryEntry {
    tier?: string;
    description?: string;
    runtime_trigger?: string;
    host_support?: Partial<Record<HostProvider, string>>;
    execution?: {
        allow_kernel_fallback?: boolean;
        ownership_model?: string;
    };
}

interface RegistryManifest {
    entries?: Record<string, RegistryEntry>;
    skills?: Record<string, RegistryEntry>;
}

export interface CapabilityExport {
    id: string;
    tier: string;
    description: string;
    runtimeTrigger: string;
    hostSupportStatus: HostSupportStatus;
    allowKernelFallback: boolean;
    ownershipModel: 'host-workflow' | 'kernel-primitive';
}

export interface GeneratedFile {
    relativePath: string;
    content: string;
}

export interface DistributionBuild {
    files: GeneratedFile[];
    geminiCapabilities: CapabilityExport[];
    codexCapabilities: CapabilityExport[];
}

export interface ReleaseBundle {
    name: 'gemini-extension' | 'codex-plugin';
    rootDir: string;
    files: GeneratedFile[];
}

const EXECUTABLE_HOST_STATUSES = new Set<HostSupportStatus>([
    'supported',
    'native-session',
    'exec-bridge',
]);
const CAPABILITY_REGISTRY_MAX_BYTES = 1024 * 1024;

function resolveProjectRoot(projectRoot: string): string {
    return path.resolve(projectRoot);
}

function loadRegistryManifest(projectRoot: string): RegistryManifest {
    const manifest = readBoundedJsonObject<RegistryManifest>(
        projectRoot,
        '.agents/skill_registry.json',
        CAPABILITY_REGISTRY_MAX_BYTES,
    );
    if (!manifest) throw new Error('capability_registry_not_found');
    return manifest;
}

function getRegistryEntries(manifest: RegistryManifest): Record<string, RegistryEntry> {
    if (manifest.entries && typeof manifest.entries === 'object') {
        return manifest.entries;
    }
    if (manifest.skills && typeof manifest.skills === 'object') {
        return manifest.skills;
    }
    return {};
}

function normalizeHostSupportStatus(value: string | undefined): HostSupportStatus {
    const normalized = value?.trim().toLowerCase();
    if (normalized === 'supported') {
        return 'supported';
    }
    if (normalized === 'native-session' || normalized === 'native') {
        return 'native-session';
    }
    if (normalized === 'exec-bridge' || normalized === 'bridge') {
        return 'exec-bridge';
    }
    if (normalized === 'policy-only') {
        return 'policy-only';
    }
    if (normalized === 'unsupported') {
        return 'unsupported';
    }
    return 'unknown';
}

function getCapabilitiesForHost(projectRoot: string, provider: HostProvider): CapabilityExport[] {
    const entries = getRegistryEntries(loadRegistryManifest(projectRoot));

    const normalizeOwnershipModel = (value: string | undefined, hostSupportStatus: HostSupportStatus): 'host-workflow' | 'kernel-primitive' => {
        const normalized = value?.trim().toLowerCase();
        if (normalized === 'kernel-primitive') {
            return 'kernel-primitive';
        }
        if (normalized === 'host-workflow') {
            return 'host-workflow';
        }
        return hostSupportStatus === 'supported' ? 'kernel-primitive' : 'host-workflow';
    };

    return Object.entries(entries)
        .map(([id, entry]) => {
            const hostSupportStatus = normalizeHostSupportStatus(entry.host_support?.[provider]);
            return {
                id,
                tier: String(entry.tier ?? 'UNKNOWN'),
                description: String(entry.description ?? '').trim(),
                runtimeTrigger: String(entry.runtime_trigger ?? id),
                hostSupportStatus,
                allowKernelFallback: entry.execution?.allow_kernel_fallback === true,
                ownershipModel: normalizeOwnershipModel(entry.execution?.ownership_model, hostSupportStatus),
            };
        })
        .filter((entry) => EXECUTABLE_HOST_STATUSES.has(entry.hostSupportStatus))
        .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildDistributions(projectRoot: string): DistributionBuild {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const geminiCapabilities = getCapabilitiesForHost(resolvedRoot, 'gemini');
    const codexCapabilities = getCapabilitiesForHost(resolvedRoot, 'codex');

    return {
        geminiCapabilities,
        codexCapabilities,
        files: [
            {
                relativePath: 'gemini-extension.json',
                content: buildGeminiManifestContent(resolvedRoot),
            },
            {
                relativePath: 'GEMINI.md',
                content: buildGeminiContextContent(resolvedRoot, geminiCapabilities),
            },
            {
                relativePath: path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
                content: buildCodexPluginManifestContent(resolvedRoot),
            },
            {
                relativePath: path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
                content: buildCodexPluginSkillContent(codexCapabilities),
            },
            {
                relativePath: path.join('plugins', 'corvus-star', 'README.md'),
                content: buildDistributionReadmeContent(geminiCapabilities, codexCapabilities),
            },
            {
                relativePath: path.join('.agents', 'plugins', 'marketplace.json'),
                content: buildMarketplaceContent(),
            },
            {
                relativePath: path.join('distributions', 'README.md'),
                content: buildDistributionReadmeContent(geminiCapabilities, codexCapabilities),
            },
        ],
    };
}

export function writeDistributions(projectRoot: string): GeneratedFile[] {
    const build = buildDistributions(projectRoot);

    for (const file of build.files) {
        const absolutePath = path.join(projectRoot, file.relativePath);
        if (
            fs.existsSync(absolutePath)
            && fs.readFileSync(absolutePath, 'utf-8') === file.content
        ) {
            continue;
        }
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, file.content, 'utf-8');
    }

    return build.files;
}

export function validateDistributions(projectRoot: string): string[] {
    const build = buildDistributions(projectRoot);
    const mismatches: string[] = [];

    for (const file of build.files) {
        const absolutePath = path.join(projectRoot, file.relativePath);
        if (!fs.existsSync(absolutePath)) {
            mismatches.push(`${file.relativePath}: missing`);
            continue;
        }

        const current = fs.readFileSync(absolutePath, 'utf-8');
        if (current !== file.content) {
            mismatches.push(`${file.relativePath}: stale`);
        }
    }

    return mismatches;
}

export function buildReleaseBundles(projectRoot: string): ReleaseBundle[] {
    const build = buildDistributions(projectRoot);
    const fileMap = new Map(build.files.map((file) => [file.relativePath, file]));

    const geminiFiles = [
        'gemini-extension.json',
        'GEMINI.md',
        path.join('distributions', 'README.md'),
    ].map((relativePath) => {
        const file = fileMap.get(relativePath);
        if (!file) {
            throw new Error(`Missing generated distribution file: ${relativePath}`);
        }
        return file;
    });

    const codexFiles = [
        path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
        path.join('plugins', 'corvus-star', 'README.md'),
        path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
        path.join('distributions', 'README.md'),
    ].map((relativePath) => {
        const file = fileMap.get(relativePath);
        if (!file) {
            throw new Error(`Missing generated distribution file: ${relativePath}`);
        }
        return file;
    });

    return [
        {
            name: 'gemini-extension',
            rootDir: path.join('dist', 'host-distributions', 'gemini-extension'),
            files: geminiFiles.map((file) => ({
                relativePath: file.relativePath === path.join('distributions', 'README.md')
                    ? 'INSTALL.md'
                    : path.basename(file.relativePath),
                content: file.content,
            })),
        },
        {
            name: 'codex-plugin',
            rootDir: path.join('dist', 'host-distributions', 'codex-plugin'),
            files: codexFiles.map((file) => ({
                relativePath: file.relativePath === path.join('.agents', 'plugins', 'marketplace.json')
                    ? path.join('.agents', 'plugins', 'marketplace.json')
                    : file.relativePath === path.join('distributions', 'README.md')
                        ? 'INSTALL.md'
                    : file.relativePath.startsWith(path.join('plugins', 'corvus-star'))
                        ? path.relative(path.join('plugins', 'corvus-star'), file.relativePath)
                        : path.basename(file.relativePath),
                content: file.content,
            })),
        },
    ];
}

export function writeReleaseBundles(projectRoot: string): ReleaseBundle[] {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const bundles = buildReleaseBundles(resolvedRoot);

    for (const bundle of bundles) {
        const bundleRoot = path.join(resolvedRoot, bundle.rootDir);
        fs.rmSync(bundleRoot, { recursive: true, force: true });
        fs.mkdirSync(bundleRoot, { recursive: true });

        for (const file of bundle.files) {
            const absolutePath = path.join(bundleRoot, file.relativePath);
            fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
            fs.writeFileSync(absolutePath, file.content, 'utf-8');
        }
    }

    return bundles;
}
