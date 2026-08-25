import fs from 'node:fs';
import path from 'node:path';

import type { CapabilityExport } from './distributions.js';

interface PackageMetadata {
    name?: string;
    version?: string;
    codexPluginVersion?: string;
    description?: string;
    homepage?: string;
    repository?: string | { url?: string };
    license?: string;
    author?: string | {
        name?: string;
        email?: string;
        url?: string;
    };
    keywords?: string[];
}

function loadPackageMetadata(projectRoot: string): PackageMetadata {
    return JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8')) as PackageMetadata;
}

function getRepositoryUrl(repository: PackageMetadata['repository']): string {
    if (typeof repository === 'string') {
        return repository;
    }
    return repository?.url ?? '';
}

function getAuthor(metadata: PackageMetadata): { name: string; email?: string; url?: string } {
    if (typeof metadata.author === 'string') {
        return {
            name: metadata.author,
        };
    }

    return {
        name: metadata.author?.name ?? 'Corvus Star',
        email: metadata.author?.email,
        url: metadata.author?.url,
    };
}

export function buildGeminiManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.version ?? '0.0.0',
        description: 'Archived Corvus Star compatibility material. No runtime or workflow integration is registered.',
        contextFileName: 'GEMINI.md',
        mcpServers: {},
    }, null, 2)}\n`;
}

export function buildGeminiContextContent(projectRoot: string, capabilities: CapabilityExport[]): string {
    const metadata = loadPackageMetadata(projectRoot);

    return [
        '# Archived Corvus Star Compatibility Material',
        '',
        '> This generated file is an inert archive tombstone.',
        '',
        '## Archive identity',
        `- Package: \`${metadata.name ?? 'corvusstar'}\` v${metadata.version ?? '0.0.0'}`,
        `- Repository: \`${getRepositoryUrl(metadata.repository) || 'local workspace'}\``,
        `- Historical registry exports retained for lineage: ${capabilities.length}`,
        '',
        '## Inactive boundary',
        '- Corvus Organism, not CStar, governs current estate work.',
        '- This extension registers no MCP server, tool, hook, workflow, or provider.',
        '- Do not launch the legacy kernel, CLI, Hall, Forge, AutoBot, Ravens, or compatibility daemons.',
        '- CStar state and generated lineage are historical evidence only.',
        '- Use the source only for inspection, preservation, migration, or explicitly bounded validation.',
        '',
    ].join('\n');
}

export function buildCodexPluginManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);
    const author = getAuthor(metadata);
    const repositoryUrl = getRepositoryUrl(metadata.repository);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.codexPluginVersion ?? metadata.version ?? '0.0.0',
        description: 'Archived Corvus Star compatibility material with no active runtime integration.',
        author,
        homepage: metadata.homepage ?? repositoryUrl,
        repository: repositoryUrl,
        license: metadata.license ?? 'UNLICENSED',
        keywords: ['corvus', 'cstar', ...(metadata.keywords ?? [])],
        interface: {
            displayName: 'Corvus Star Archive',
            shortDescription: 'Inactive CStar archive compatibility metadata.',
            longDescription: 'Preserves historical CStar source lineage without registering skills, tools, hooks, or workflow authority.',
            developerName: author.name,
            category: 'Developer Tools',
            capabilities: ['Read'],
            websiteURL: metadata.homepage ?? repositoryUrl,
            privacyPolicyURL: metadata.homepage ?? repositoryUrl,
            termsOfServiceURL: metadata.homepage ?? repositoryUrl,
            defaultPrompt: [
                'Treat CStar as inactive historical source and evidence.',
                'Follow the parent Corvus Organism projection for current workflow authority.',
                'Do not launch, install, or route work through CStar.',
            ],
            brandColor: '#0F6E5B',
        },
    }, null, 2)}\n`;
}

export function buildCodexPluginSkillContent(capabilities: CapabilityExport[]): string {
    void capabilities;

    return [
        '---',
        'name: corvus-star-archive',
        'description: "Archived CStar compatibility notice. It grants no tools, routing, lifecycle, or execution authority."',
        '---',
        '',
        '# Archived Corvus Star Plugin Material',
        '',
        '- The generated plugin manifest does not register this file as a skill.',
        '- Corvus Organism governs current workflow and lifecycle decisions.',
        '- Do not invoke CStar kernel, CLI, Hall, Forge, AutoBot, or provider routes.',
        '- Historical source may be inspected, preserved, migrated, or tested only.',
        '- No CStar registry, packet, receipt, callback, or runtime observation grants authority.',
        '',
    ].join('\n');
}

export function buildDistributionReadmeContent(geminiCapabilities: CapabilityExport[], codexCapabilities: CapabilityExport[]): string {
    return [
        '# Archived Corvus Star Distribution Material',
        '',
        'These generated files preserve exact historical lineage while remaining inert.',
        '',
        '- `gemini-extension.json` registers zero MCP servers.',
        '- The Codex manifest registers no skills, MCP servers, hooks, or write capability.',
        '- The local marketplace contains zero installable plugins.',
        '- `lineage.json` records source identities; it does not activate them.',
        '- Do not stage, install, activate, restart, or publish these artifacts.',
        '',
        '## Historical lineage summary',
        `- Gemini registry entries retained in lineage: ${geminiCapabilities.length}`,
        `- Codex registry entries retained in lineage: ${codexCapabilities.length}`,
        '',
        '## Regeneration',
        '- `npm run build:distributions`',
        '- `npm run validate:distributions`',
        '',
    ].join('\n');
}

export function buildMarketplaceContent(): string {
    return `${JSON.stringify({
        name: 'corvus-star',
        interface: {
            displayName: 'Corvus Star',
        },
        plugins: [],
    }, null, 2)}\n`;
}
