import fs from 'node:fs';
import path from 'node:path';

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

interface PackageMetadata {
    name?: string;
    version?: string;
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

interface AgentsConfig {
    system?: {
        persona?: string;
    };
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

interface McpServerConfig {
    command: string;
    args: string[];
    cwd?: string;
    env?: Record<string, string>;
    note?: string;
}

const EXECUTABLE_HOST_STATUSES = new Set<HostSupportStatus>([
    'supported',
    'native-session',
    'exec-bridge',
]);

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function resolveProjectRoot(projectRoot: string): string {
    return path.resolve(projectRoot);
}

function loadRegistryManifest(projectRoot: string): RegistryManifest {
    return readJsonFile<RegistryManifest>(path.join(projectRoot, '.agents', 'skill_registry.json'));
}

function loadPackageMetadata(projectRoot: string): PackageMetadata {
    return readJsonFile<PackageMetadata>(path.join(projectRoot, 'package.json'));
}

function loadAgentsConfig(projectRoot: string): AgentsConfig {
    return readJsonFile<AgentsConfig>(path.join(projectRoot, '.agents', 'config.json'));
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

function getDisplayDescription(metadata: PackageMetadata): string {
    if (metadata.description && metadata.description.trim()) {
        return metadata.description.trim();
    }

    return 'Host-native supervisor integration for the Corvus Star runtime.';
}

function formatCapabilityLine(entry: CapabilityExport): string {
    const fallbackSuffix = entry.allowKernelFallback ? 'kernel fallback allowed' : 'kernel fallback forbidden';
    return `- \`${entry.id}\` (${entry.tier}, ${entry.hostSupportStatus}, ${entry.ownershipModel}, ${fallbackSuffix})`;
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
                allowKernelFallback: entry.execution?.allow_kernel_fallback !== false,
                ownershipModel: normalizeOwnershipModel(entry.execution?.ownership_model, hostSupportStatus),
            };
        })
        .filter((entry) => EXECUTABLE_HOST_STATUSES.has(entry.hostSupportStatus))
        .sort((left, right) => left.id.localeCompare(right.id));
}

function buildGeminiManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.version ?? '0.0.0',
        contextFileName: 'GEMINI.md',
        mcpServers: buildGeminiMcpServers(),
    }, null, 2)}\n`;
}

function buildGeminiContextContent(projectRoot: string, capabilities: CapabilityExport[]): string {
    const metadata = loadPackageMetadata(projectRoot);
    const agentsConfig = loadAgentsConfig(projectRoot);
    const persona = agentsConfig.system?.persona ?? 'O.D.I.N.';
    const commands = [
        '`./cstar <command>`',
        '`node bin/cstar.js <command>`',
        '`./cstar hall "<query>"`',
    ];
    const topCapabilities = capabilities.slice(0, 12).map(formatCapabilityLine);

    return [
        '# Corvus Star',
        '',
        `> Host-native Gemini CLI extension for the authoritative CStar runtime.`,
        '',
        '## Identity',
        `- Package: \`${metadata.name ?? 'corvusstar'}\` v${metadata.version ?? '0.0.0'}`,
        `- Persona: \`${persona}\``,
        `- Repository: \`${getRepositoryUrl(metadata.repository) || 'local workspace'}\``,
        '',
        '## Authority Order',
        '- Registry and runtime contracts outrank prose.',
        '- Treat `.agents/skill_registry.json` as the capability source of truth.',
        '- Prefer Hall discovery before broad local scans.',
        '',
        '## Launcher Contract',
        ...commands.map((command) => `- ${command}`),
        '',
        '## Host Behavior',
        '- Read `AGENTS.qmd` at session start before making structural claims.',
        '- Use `./cstar hall "<query>"` for estate discovery before ad hoc search.',
        '- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.',
        '- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.',
        '',
        `## Exported Gemini Capabilities (${capabilities.length})`,
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
        '## Notes',
        '- This extension is generated from the registry-backed distribution builder.',
        '- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.',
        '',
    ].join('\n');
}

function buildCodexPluginManifestContent(projectRoot: string): string {
    const metadata = loadPackageMetadata(projectRoot);
    const author = getAuthor(metadata);
    const repositoryUrl = getRepositoryUrl(metadata.repository);

    return `${JSON.stringify({
        name: 'corvus-star',
        version: metadata.version ?? '0.0.0',
        description: getDisplayDescription(metadata),
        author,
        homepage: metadata.homepage ?? repositoryUrl,
        repository: repositoryUrl,
        license: metadata.license ?? 'UNLICENSED',
        keywords: ['corvus', 'cstar', ...(metadata.keywords ?? [])],
        skills: './skills/',
        hooks: './hooks.json',
        mcpServers: './.mcp.json',
        interface: {
            displayName: 'Corvus Star',
            shortDescription: 'Host-native Corvus integration for Codex.',
            longDescription: 'Routes Codex through the authoritative CStar runtime, Hall, and host-native supervisor model with explicit kernel primitives.',
            developerName: author.name,
            category: 'Developer Tools',
            capabilities: ['Interactive', 'Write'],
            websiteURL: metadata.homepage ?? repositoryUrl,
            privacyPolicyURL: metadata.homepage ?? repositoryUrl,
            termsOfServiceURL: metadata.homepage ?? repositoryUrl,
            defaultPrompt: [
                'Resume CStar work through the Hall.',
                'Find the active bead before editing.',
                'Use the CStar trace handoff.',
            ],
            brandColor: '#0F6E5B',
        },
    }, null, 2)}\n`;
}

function buildCodexPluginSkillContent(capabilities: CapabilityExport[]): string {
    const topCapabilities = capabilities.slice(0, 12).map(formatCapabilityLine);

    return [
        '---',
        'name: corvus-star',
        'description: "Use when operating inside the Corvus Star estate so Codex follows the CStar authority order, Hall discovery path, and launcher contract."',
        'metadata:',
        '  priority: 5',
        '  pathPatterns:',
        "    - 'CStar/**'",
        "    - 'AGENTS.md'",
        "    - 'AGENTS.qmd'",
        "    - 'BIDE_INTEGRATION_GUIDE.md'",
        "    - '.agents/skill_registry.json'",
        '  bashPatterns:',
        "    - '\\\\bcstar\\\\s+(hall|trace|one-mind|status|manifest|evolve|orchestrate)\\\\b'",
        "    - '\\\\bnode\\\\s+bin/cstar\\\\.js\\\\s+'",
        '  promptSignals:',
        '    phrases:',
        '      - "CStar"',
        '      - "Corvus"',
        '      - "Hall of Records"',
        '      - "bead"',
        '      - "Mimir"',
        '      - "Gungnir"',
        '---',
        '',
        '# Corvus Star Plugin',
        '',
        '## When to Use',
        '- Use when the workspace is the Corvus estate or a Corvus spoke.',
        '- Use when Codex should route discovery and execution through CStar instead of ad hoc scripts.',
        '',
        '## Required Behavior',
        '- Read only the specific CStar authority files needed for the task. Start with `AGENTS.qmd` and `.agents/skill_registry.json` before architectural claims.',
        '- Run `./cstar hall "<query>"` from the CStar root before broad local scans, and quote only the relevant Hall hits back into context.',
        '- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` as canonical launchers.',
        '- Use `./cstar trace handoff --json` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.',
        '- Use `./cstar one-mind agents --json` and `./cstar one-mind events --bead <id> --json` only when coordination or active ownership matters.',
        '- Keep host-specific packaging separate from kernel logic.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.',
        '- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/trace commands for bounded state and evidence.',
        '',
        '## Context Budget',
        '- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.',
        '- Prefer one Hall query per mission, then narrower follow-up queries by bead id, target path, or error text.',
        '- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.',
        '- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.',
        '',
        '## Bead Workflow',
        '1. Identify the mission and run a targeted `./cstar hall "<intent or bead id>"` query.',
        '2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.',
        '3. If no bead matches and the task is structural, use host-native planning in-session and record the intended Hall path in the response.',
        '4. Before edits, state the bead/trace anchor and the files you will touch.',
        '5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.',
        '6. If CStar reports a live planning/runtime failure, triage it before returning to spoke work unless the user explicitly defers it.',
        '',
        '## Silent Hook',
        '- The plugin includes a PostToolUse hook that only refreshes a local stamp and captures a tiny trace handoff in `/tmp`; it must stay silent and must not inject Hall payloads into Codex context.',
        '',
        `## Exported Codex Capabilities (${capabilities.length})`,
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
    ].join('\n');
}

function buildCodexHooksContent(): string {
    return `${JSON.stringify({
        hooks: {
            PostToolUse: [
                {
                    matcher: 'Write|Edit|MultiEdit|apply_patch',
                    hooks: [
                        {
                            type: 'command',
                            command: 'bash ./scripts/cstar_codex_post_write.sh',
                        },
                    ],
                },
            ],
        },
    }, null, 2)}\n`;
}

function buildCodexPostWriteHookContent(projectRoot: string): string {
    return [
        '#!/usr/bin/env bash',
        'set -u',
        '',
        `CSTAR_ROOT="${projectRoot.replace(/"/g, '\\"')}"`,
        'if [ ! -x "$CSTAR_ROOT/cstar" ]; then',
        '  exit 0',
        'fi',
        '',
        'case "${PWD:-}" in',
        '  "$CSTAR_ROOT"|"$CSTAR_ROOT"/*|/home/morderith/Corvus|/home/morderith/Corvus/*) ;;',
        '  *) exit 0 ;;',
        'esac',
        '',
        'STAMP_DIR="${TMPDIR:-/tmp}/corvus-codex"',
        'mkdir -p "$STAMP_DIR" 2>/dev/null || exit 0',
        'date -u +"%Y-%m-%dT%H:%M:%SZ" > "$STAMP_DIR/last-post-write" 2>/dev/null || true',
        '',
        '# Keep this hook context-neutral: capture a tiny handoff for manual inspection, never print Hall payloads.',
        '( cd "$CSTAR_ROOT" && ./cstar trace handoff --json > "$STAMP_DIR/last-trace-handoff.json" 2>/dev/null ) || true',
        'exit 0',
        '',
    ].join('\n');
}

function buildMcpServers(rootCwd: string | undefined): Record<string, McpServerConfig> {
    return {
        pennyone: {
            command: 'node',
            args: ['bin/pennyone-mcp.js'],
            ...(rootCwd ? { cwd: rootCwd } : {}),
            env: {
                GEMINI_CLI_ACTIVE: 'true',
            },
            note: 'Authoritative Corvus Hall and PennyOne MCP surface.',
        },
        'corvus-control': {
            command: 'node',
            args: ['scripts/run-tsx.mjs', 'src/tools/corvus-control-mcp.ts'],
            ...(rootCwd ? { cwd: rootCwd } : {}),
            env: {
                GEMINI_CLI_ACTIVE: 'true',
            },
            note: 'Kernel-backed Corvus workflow and control-plane MCP surface.',
        },
    };
}

function buildGeminiMcpServers(): Record<string, McpServerConfig> {
    return buildMcpServers('.');
}

function buildCodexPluginMcpContent(): string {
    return `${JSON.stringify({
        mcpServers: buildMcpServers('../..'),
    }, null, 2)}\n`;
}

function buildDistributionReadmeContent(geminiCapabilities: CapabilityExport[], codexCapabilities: CapabilityExport[]): string {
    return [
        '# Corvus Star Install Surfaces',
        '',
        'This repository generates host install artifacts from the authoritative registry and runtime contracts.',
        '',
        '## Gemini CLI',
        '- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.',
        '- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.',
        '- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '- Local bootstrap: `npm run install:gemini-local`',
        '',
        '## Codex',
        '- The repo-local plugin lives under `plugins/corvus-star/`.',
        '- The marketplace entry lives under `.agents/plugins/marketplace.json`.',
        '- The plugin points back to the same kernel root through `.mcp.json`.',
        '- Codex install surfaces are generated from the same registry-backed host/kernel split as Gemini.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '- Local bootstrap: `npm run install:codex-local`',
        '',
        '## Combined Local Bootstrap',
        '- `npm run install:hosts-local`',
        '',
        `## Export Summary`,
        `- Gemini executable capabilities: ${geminiCapabilities.length}`,
        `- Codex executable capabilities: ${codexCapabilities.length}`,
        '',
        '## Regeneration',
        '- `npm run build:distributions`',
        '- `npm run validate:distributions`',
        '- `npm run build:release-bundles`',
        '- `npm run build:release-archives`',
        '- `npm run release:prepare`',
        '',
        '## CI',
        '- Pull requests and pushes should fail if generated install artifacts drift from the registry-backed source.',
        '- Tagged pushes and manual runs can publish host-ready bundle artifacts from `dist/host-distributions/`.',
        '- Sync local `~/.gemini` and `~/.codex` installs from these generated artifacts instead of hand-editing host surfaces.',
        '',
    ].join('\n');
}

function buildMarketplaceContent(): string {
    return `${JSON.stringify({
        name: 'corvus-star',
        interface: {
            displayName: 'Corvus Star',
        },
        plugins: [
            {
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
            },
        ],
    }, null, 2)}\n`;
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
                relativePath: path.join('plugins', 'corvus-star', '.mcp.json'),
                content: buildCodexPluginMcpContent(),
            },
            {
                relativePath: path.join('plugins', 'corvus-star', 'hooks.json'),
                content: buildCodexHooksContent(),
            },
            {
                relativePath: path.join('plugins', 'corvus-star', 'scripts', 'cstar_codex_post_write.sh'),
                content: buildCodexPostWriteHookContent(resolvedRoot),
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
        path.join('plugins', 'corvus-star', '.mcp.json'),
        path.join('plugins', 'corvus-star', 'README.md'),
        path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
        path.join('.agents', 'plugins', 'marketplace.json'),
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
