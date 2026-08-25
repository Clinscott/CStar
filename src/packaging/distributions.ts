import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { resolveSkillRegistryEntries } from '../core/skill_registry_contract.js';
import {
    CSTAR_KERNEL_TOOL_CATALOG,
    CSTAR_KERNEL_TOOL_NAMES,
} from '../tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import {
    assertManagedPathSafe,
    assertNoRecoveryArtifacts,
    assertRegularTree,
    listRegularFiles,
    parseStrictSemver,
    resolveCanonicalDirectory,
} from './packaging_safety.js';

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
    obsoletePaths: string[];
    geminiCapabilities: CapabilityExport[];
    codexCapabilities: CapabilityExport[];
}

export interface RuntimeBinding {
    host: 'gemini' | 'codex';
    integration_mode: 'extension-mcp-config' | 'skill-only';
    kernel_registration: 'extension-manifest' | 'host-global';
    kernel_bundled: false;
    kernel_requirement: 'external-cstar-runtime';
}

export interface ReleaseBundle {
    name: 'gemini-extension' | 'codex-plugin';
    rootDir: string;
    runtimeBinding: RuntimeBinding;
    files: GeneratedFile[];
}

export interface ReleaseBundleManifest {
    schema_version: 1;
    version: string;
    bundles: Array<{
        name: ReleaseBundle['name'];
        root_dir: string;
        sha256: string;
        runtime_binding: RuntimeBinding;
        files: Array<{
            path: string;
            bytes: number;
            sha256: string;
        }>;
    }>;
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

export const GEMINI_RUNTIME_BINDING: RuntimeBinding = Object.freeze({
    host: 'gemini',
    integration_mode: 'extension-mcp-config',
    kernel_registration: 'extension-manifest',
    kernel_bundled: false,
    kernel_requirement: 'external-cstar-runtime',
});

export const CODEX_PLUGIN_RUNTIME_BINDING: RuntimeBinding = Object.freeze({
    host: 'codex',
    integration_mode: 'skill-only',
    kernel_registration: 'host-global',
    kernel_bundled: false,
    kernel_requirement: 'external-cstar-runtime',
});

function sha256(content: string | Buffer): string {
    return createHash('sha256').update(content).digest('hex');
}

function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => canonicalize(entry));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, canonicalize(entry)]),
        );
    }
    return value;
}

function hashCanonicalJson(value: unknown): string {
    return sha256(JSON.stringify(canonicalize(value)));
}

function portablePath(filePath: string): string {
    return filePath.split(path.sep).join('/');
}

function readJsonFile<T>(filePath: string): T {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function resolveProjectRoot(projectRoot: string): string {
    return resolveCanonicalDirectory(projectRoot, 'CStar project root');
}

function loadRegistryManifest(projectRoot: string): RegistryManifest {
    const manifest = readJsonFile<unknown>(path.join(projectRoot, '.agents', 'skill_registry.json'));
    resolveSkillRegistryEntries<RegistryEntry>(manifest);
    return manifest as RegistryManifest;
}

function loadPackageMetadata(projectRoot: string): PackageMetadata {
    const metadata = readJsonFile<PackageMetadata>(path.join(projectRoot, 'package.json'));
    parseStrictSemver(metadata.version, 'package version');
    return metadata;
}

function loadAgentsConfig(projectRoot: string): AgentsConfig {
    return readJsonFile<AgentsConfig>(path.join(projectRoot, '.agents', 'config.json'));
}

function getRegistryEntries(manifest: RegistryManifest): Record<string, RegistryEntry> {
    return resolveSkillRegistryEntries<RegistryEntry>(manifest);
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
        description: 'Corvus Star host-native extension with Hall discovery, Augury routing, and kernel-backed CStar control.',
        contextFileName: 'GEMINI.md',
        mcpServers: buildGeminiMcpServers(),
    }, null, 2)}\n`;
}

function buildAuguryDisplaySection(): string[] {
    return [
        '## Corvus Star Augury [\u03a9]',
        '- Augury is a read-only typed route explanation, not permission and not a generic trace ritual.',
        '- Use it at a new or ambiguous route or material scope change; reuse fresh mission state otherwise.',
        '- Council experts are advisory critique lenses, not votes, owners, authority, or proof.',
        '- TokenPath is quarantined; it must not advise, steer, emit confidence, or accept observation writes until independently promoted.',
        '- Do not echo a full Augury block unless the operator asks for the route packet.',
        '- Foundational CStar work uses `Scope: brain:CStar`; use `Scope: spoke:<name>` only when a spoke is explicit.',
        '',
    ];
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
        '- Platform/operator policy and nearest authority files govern. Current CStar lifecycle state follows within those gates.',
        '- Registry/tool declarations define capability; runtime observations are evidence. Neither may create authority.',
        '- Prefer `cstar-kernel` MCP surfaces before shell launchers or broad local scans.',
        '- Use `cstar_bead` for bead lifecycle when it is available.',
        '',
        '## Launcher Contract',
        '- Use `cstar-kernel` MCP tools first for CStar control-plane work.',
        ...commands.map((command) => `- ${command}`),
        '',
        '## Host Behavior',
        '- Read the nearest `AGENTS.md` or `AGENTS.qmd` before making structural claims; those files own current role, topology, and operator-gate policy.',
        '- Treat `docs/integrations/codex_mcp_contract.md` as the current Codex/CStar integration contract.',
        '- Use `cstar_hall_search` for estate discovery before ad hoc search; use `./cstar hall "<query>"` only when MCP cannot provide the needed primitive.',
        '- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.',
        '- If the MCP surface is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.',
        '- Follow the nearest authority file for ownership and operator gates instead of relying on generated copies of mutable estate topology.',
        '- Keep reasoning, planning, critique, and recovery in the host session when the registry marks a capability host-executable.',
        '- Keep deterministic local primitives in the kernel; do not fork Gemini-specific capability definitions.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed, and treat `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with kernel fallback forbidden must fail closed when no host session is active; they must not degrade into legacy kernel cognition.',
        '',
        ...buildAuguryDisplaySection(),
        ...buildKernelMcpToolsSection(),
        `## Exported Gemini Capabilities (${capabilities.length})`,
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
        '## Notes',
        '- This extension is generated from the registry-backed distribution builder.',
        '- Capabilities marked `policy-only` or `unsupported` are intentionally omitted.',
        '- The `cstar-kernel` MCP server is wired up by `mcpServers` in `gemini-extension.json` — invoke kernel tools directly through MCP, not via shell, whenever the needed primitive exists.',
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
        description: 'Host-native Corvus Star Augury, Hall, and CStar runtime integration.',
        author,
        homepage: metadata.homepage ?? repositoryUrl,
        repository: repositoryUrl,
        license: metadata.license ?? 'UNLICENSED',
        keywords: ['corvus', 'cstar', ...(metadata.keywords ?? [])],
        skills: './skills/',
        interface: {
            displayName: 'Corvus Star',
            shortDescription: 'Corvus Star Augury and Hall integration for Codex.',
            longDescription: 'Routes Codex through CStar with bounded Augury explanation, Hall/Mimir discovery, advisory Council lenses, and explicit host/kernel boundaries.',
            developerName: author.name,
            category: 'Developer Tools',
            capabilities: ['Interactive', 'Write'],
            websiteURL: metadata.homepage ?? repositoryUrl,
            privacyPolicyURL: metadata.homepage ?? repositoryUrl,
            termsOfServiceURL: metadata.homepage ?? repositoryUrl,
            defaultPrompt: [
                'Use Corvus Star Augury when CStar route or scope is ambiguous.',
                'Use Hall/Mimir discovery before broad local scans.',
                'Treat Augury as advisory and confidence as not measured unless an independent scorer ran.',
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
        "    - '\\\\bcstar\\\\s+(hall|augury|trace|one-mind|status|manifest|evolve|orchestrate)\\\\b'",
        "    - '\\\\bnode\\\\s+bin/cstar\\\\.js\\\\s+'",
        '  promptSignals:',
        '    phrases:',
        '      - "CStar"',
        '      - "Corvus"',
        '      - "Hall of Records"',
        '      - "bead"',
        '      - "Mimir"',
        '      - "Mimir\'s Well"',
        '      - "Gungnir"',
        '      - "Augury"',
        '      - "Council of Experts"',
        '---',
        '',
        '# Corvus Star Plugin',
        '',
        '## When to Use',
        '- Use when the workspace is the Corvus estate or a Corvus spoke.',
        '- Use when Codex should route discovery and execution through CStar instead of ad hoc scripts.',
        '- Authoritative integration contract: `docs/integrations/codex_mcp_contract.md`.',
        '',
        '## Required Behavior',
        '- Read only the specific CStar authority files needed for the task. Start with the nearest `AGENTS.md` or `AGENTS.qmd`, then `.agents/skill_registry.json`, before architectural claims.',
        '- Current role, topology, ownership, and operator-gate policy come from the nearest authority file; this generated skill deliberately does not duplicate that mutable policy.',
        '- CStar is canonical for Corvus planning, proposals, execution state, validation, and completion; do not use direct Hall/SQLite writes when kernel primitives exist.',
        '- Prefer `cstar-kernel` MCP tools first for CStar control-plane work: `cstar_doctor`, `cstar_handoff`, `cstar_augury`, `cstar_hall_search`, `cstar_verify_plan`, `cstar_bead`, and `cstar_record_result` where exposed.',
        '- Use `cstar_hall_search` before broad local scans, and quote only the relevant Hall hits back into context.',
        '- Use `cstar_bead` for bead get/list/create/claim/status/block/resolve operations when available.',
        '- If MCP is degraded or unavailable, report the exact failure and remain read-only for control-plane state; do not mutate Hall or SQLite directly.',
        '- Use `./cstar <command>` from the CStar root or `node bin/cstar.js <command>` only when MCP cannot provide the needed primitive or the capability is explicitly terminal-required.',
        '- Use `cstar_handoff` when resuming active planning/runtime state, then carry forward only the lead bead, gate, next action, target paths, and checker commands.',
        '- Use `cstar_doctor` when kernel health is unknown or a current probe reports degradation.',
        '- Use `cstar_augury` only when route or material scope is ambiguous; it explains a route but grants no authority.',
        '- Use direct Codex thread tools for read/list/send when exposed; session JSONL fallback is read-only degraded mode, not an execution or assignment surface.',
        '- Keep high-volume collectors outside beads; collectors write receipts or artifacts, then bounded proposals/results enter CStar.',
        '- Public AutoBot routing is decommissioned. Refer to Hermes/MiniMax only for the private durable Forge request/execute adapter; direct Hermes and Codex-subagent implementation routes are forbidden.',
        '- Keep host-specific packaging separate from kernel logic.',
        '- Treat `native-session` and `exec-bridge` capabilities as host-routed work, and `supported` capabilities as kernel-backed launch surfaces.',
        '- Treat `host-workflow` entries as host-owned cognition/workflow surfaces and `kernel-primitive` entries as deterministic kernel control-plane primitives.',
        '- Public host fronts marked with forbidden kernel fallback must fail closed instead of dropping into legacy kernel cognition.',
        '- Do not run shell `cstar chant` for host-only planning. In Codex, perform the host-native planning and critique in-session, using Hall/Augury state commands for bounded state and evidence.',
        '',
        ...buildAuguryDisplaySection(),
        ...buildKernelMcpToolsSection(),
        '## Context Budget',
        '- Never preload Hall memory, logs, full registry dumps, or complete bead ledgers.',
        '- Use at most one broad Hall query when discovery genuinely needs it, then narrow by bead id, target path, or error text.',
        '- Summarize Hall results as current instructions only when they are OPEN/SET/PLAN_READY or explicitly match the user request. Treat logs and archived results as leads.',
        '- Keep retrieved snippets to the minimum needed to choose files, commands, verification, and next action.',
        '',
        '## Bead Workflow',
        '1. Resume a known bead with `cstar_handoff`; use bounded Hall discovery only when its identity is unknown.',
        '2. If an OPEN or SET bead matches, anchor work to that bead and inspect only its target paths plus directly adjacent files.',
        '3. If no bead matches and the task changes Corvus state, create or propose the bounded lifecycle record before implementation.',
        '4. Use Augury only for ambiguous route or material scope; do not make it a per-edit ritual.',
        '5. After edits, run the checker from the bead when present; otherwise run the focused CStar or spoke test that matches the touched surface.',
        '6. Record meaningful validation and closeout through CStar; a package, callback, or model claim is evidence rather than lifecycle state.',
        '',
        '## Registry-Exported Codex Capabilities',
        '- This list is generated from `.agents/skill_registry.json` and may be empty when no Codex executable capabilities are registered.',
        ...(topCapabilities.length > 0 ? topCapabilities : ['- None exported.']),
        '',
    ].join('\n');
}

function buildMcpServers(rootCwd: string | undefined): Record<string, McpServerConfig> {
    return {
        'cstar-kernel': {
            command: 'node',
            args: ['bin/cstar-kernel-mcp.js'],
            ...(rootCwd ? { cwd: rootCwd } : {}),
            env: {
                GEMINI_CLI_ACTIVE: 'true',
                CSTAR_KERNEL_DISABLE_WATCH: '1',
            },
            note: `CStar kernel MCP — ${CSTAR_KERNEL_TOOL_NAMES.length}-tool surface. See docs/integrations/cstar-kernel-mcp.md for the full API reference.`,
        },
    };
}

function buildKernelMcpToolsSection(): string[] {
    return [
        `## Kernel MCP Tools (${CSTAR_KERNEL_TOOL_NAMES.length})`,
        '',
        'The `cstar-kernel` MCP server is the authoritative kernel surface — invoke these tools directly via MCP rather than shelling out to `./cstar` whenever the needed primitive exists. Live Forge uses durable request/attempt rows, one-shot operator attestation, atomic reservation, exact request/package/output locks, and idempotent replay. Adapter delivery remains pending until independent validation. Tool classification, request shape, or a caller-supplied reference is not authority proof. An already-running host must reload repaired source before changes are live. Full API reference: `docs/integrations/cstar-kernel-mcp.md`.',
        '',
        ...CSTAR_KERNEL_TOOL_CATALOG.map(({ name, toolClass, description }) => `- \`${name}\` (${toolClass}) — ${description}`),
        '',
    ];
}

function buildGeminiMcpServers(): Record<string, McpServerConfig> {
    return buildMcpServers('.');
}

function buildDistributionReadmeContent(geminiCapabilities: CapabilityExport[], codexCapabilities: CapabilityExport[]): string {
    return [
        '# Corvus Star Source and Release Surfaces',
        '',
        'This repository generates host source-staging and external-runtime release artifacts from the authoritative registry and runtime contracts.',
        '',
        '## Gemini CLI',
        '- Install from the repository root so `gemini-extension.json` and `GEMINI.md` are available.',
        '- The extension exposes registry-filtered capabilities and MCP server wiring from the kernel root.',
        '- Gemini context is generated around the host-native supervisor model: host cognition, kernel primitives.',
        '- The Gemini context teaches bounded, on-demand Corvus Star Augury routing.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '- Local source-link staging: `npm run install:gemini-local`; new-session pickup and live proof remain separate.',
        '',
        '## Codex',
        '- The repo-local plugin lives under `plugins/corvus-star/`.',
        '- The marketplace entry lives under `.agents/plugins/marketplace.json`.',
        '- The plugin is skill-only and intentionally contains no hooks, `.mcp.json`, or bundled kernel.',
        '- Codex reaches CStar through the single host-global `cstar-kernel` registration defined by the current integration contract.',
        '- `plugins/corvus-star/lineage.json` binds the immutable plugin version to its tool catalog, exported capabilities, runtime mode, and per-file hashes.',
        '- Codex source-staging surfaces are generated from the same registry-backed host/kernel split as Gemini.',
        '- Codex skill context teaches bounded, on-demand Corvus Star Augury routing.',
        '- Public host fronts marked as no-fallback are expected to fail closed when the host session is unavailable.',
        '- Source staging only: `npm run install:codex-local` verifies and stages the plugin under `~/plugins/corvus-star`; it does not run `codex plugin add`, refresh Codex cache, restart Desktop, or prove live activation.',
        '- Marketplace reconciliation, `codex plugin add`, restart/new-task pickup, and live MCP proof are a separate operator-gated activation flow.',
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
        '- Pull requests and pushes should fail if generated host artifacts drift from the registry-backed source.',
        '- Tagged pushes and manual runs can publish external-runtime-dependent host overlays from `dist/host-distributions/`; the archives do not bundle CStar itself.',
        '- Stage source from generated artifacts, then use the separately operator-gated supported host activation flow instead of hand-editing host surfaces.',
        '',
    ].join('\n');
}

function buildCodexBundleInstallContent(): string {
    return [
        '# Corvus Star Codex Plugin Bundle',
        '',
        'This archive is a self-contained local Codex marketplace root. Keep its directory layout intact.',
        '',
        '## Prerequisites',
        '- Install and validate the external CStar runtime separately; this plugin intentionally bundles no kernel.',
        '- Configure the single host-global `cstar-kernel` entry to use the supported `cstar-kernel-mcp-wrapper` bridge. Do not add a plugin-local MCP registration.',
        '- Treat marketplace activation, cache refresh, restart, and live proof as operator-gated actions.',
        '',
        '## Operator-Gated Activation',
        '1. Extract the archive without flattening it; the extracted directory is `<bundle-root>`.',
        '2. Register the extracted marketplace with `codex plugin marketplace add <bundle-root>`.',
        '3. Install from that marketplace with `codex plugin add corvus-star@corvus-star`.',
        '4. Start a new Codex task so the updated plugin is discovered.',
        '5. Prove activation through the live global wrapper path with `cstar_doctor`, `cstar_handoff`, `cstar_augury`, and `cstar_hall_search`.',
        '',
        'The bundled marketplace resolves `./plugins/corvus-star` inside this archive. Source staging or archive extraction alone is not activation proof.',
        '',
    ].join('\n');
}

function buildGeminiBundleManifestContent(projectRoot: string): string {
    const manifest = JSON.parse(buildGeminiManifestContent(projectRoot)) as Record<string, unknown>;
    manifest.description = 'Corvus Star Gemini extension overlay for an external CStar runtime.';
    manifest.mcpServers = {
        'cstar-kernel': {
            command: 'node',
            args: ['scripts/cstar_external_runtime_mcp.mjs'],
            cwd: '.',
            env: {
                CSTAR_KERNEL_DISABLE_WATCH: '1',
            },
            note: 'External-runtime launcher. CSTAR_ROOT must identify a validated CStar source root.',
        },
    };
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

function buildGeminiExternalRuntimeLauncherContent(): string {
    return [
        "import fs from 'node:fs';",
        "import path from 'node:path';",
        "import { spawn } from 'node:child_process';",
        '',
        "const configuredRoot = process.env.CSTAR_ROOT || process.env.CORVUS_CSTAR_ROOT || '';",
        "if (!configuredRoot || !path.isAbsolute(configuredRoot)) {",
        "  console.error('[corvus:gemini] CSTAR_ROOT must be an absolute path to the external CStar runtime.');",
        '  process.exit(78);',
        '}',
        'const cstarRoot = fs.realpathSync(configuredRoot);',
        "const launcher = path.join(cstarRoot, 'bin', 'cstar-kernel-mcp.js');",
        'const stat = fs.lstatSync(launcher);',
        'if (stat.isSymbolicLink() || !stat.isFile()) {',
        "  console.error(`[corvus:gemini] External CStar launcher is not a regular file: ${launcher}`);",
        '  process.exit(78);',
        '}',
        'const child = spawn(process.execPath, [launcher], {',
        '  cwd: cstarRoot,',
        "  env: { ...process.env, CSTAR_KERNEL_DISABLE_WATCH: '1' },",
        "  stdio: 'inherit',",
        '});',
        "const signalExitCodes = { SIGINT: 130, SIGTERM: 143, SIGKILL: 137 };",
        "const forwardedSignals = ['SIGINT', 'SIGTERM'];",
        'let forceTimer = null;',
        'let forwarding = false;',
        'const handlers = new Map();',
        'for (const signal of forwardedSignals) {',
        '  const handler = () => {',
        '    if (forwarding || child.exitCode !== null || child.signalCode !== null) return;',
        '    forwarding = true;',
        '    child.kill(signal);',
        '    forceTimer = setTimeout(() => {',
        "      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');",
        '    }, 1500);',
        '    forceTimer.unref?.();',
        '  };',
        '  handlers.set(signal, handler);',
        '  process.on(signal, handler);',
        '}',
        'const cleanup = () => {',
        '  if (forceTimer !== null) clearTimeout(forceTimer);',
        '  for (const [signal, handler] of handlers) process.removeListener(signal, handler);',
        '};',
        "child.on('error', (error) => { cleanup(); console.error(error); process.exit(1); });",
        "child.on('exit', (code, signal) => {",
        '  cleanup();',
        '  process.exit(typeof code === \'number\' ? code : (signalExitCodes[signal] ?? 1));',
        '});',
        '',
    ].join('\n');
}

function buildGeminiBundleInstallContent(): string {
    return [
        '# Corvus Star Gemini Extension Overlay',
        '',
        'This archive is not a standalone CStar runtime. It is a Gemini extension overlay that launches an external, validated CStar source root.',
        '',
        '## Operator-Gated Activation',
        '1. Install and validate CStar separately.',
        '2. Set `CSTAR_ROOT` to the absolute external CStar root containing `bin/cstar-kernel-mcp.js`.',
        '3. Extract this archive without flattening it and install the extracted root through the supported Gemini extension workflow.',
        '4. Start a new Gemini session.',
        '5. Prove the live MCP path before claiming activation.',
        '',
        'The bundled manifest resolves its launcher inside this archive; that launcher fails closed unless `CSTAR_ROOT` identifies the external runtime.',
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

function buildCodexPluginLineageContent(
    version: string,
    pluginFiles: GeneratedFile[],
    geminiCapabilities: CapabilityExport[],
    codexCapabilities: CapabilityExport[],
): string {
    const pluginRoot = path.join('plugins', 'corvus-star');
    const files = Object.fromEntries(
        pluginFiles
            .map((file) => ({
                relativePath: portablePath(path.relative(pluginRoot, file.relativePath)),
                content: file.content,
            }))
            .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
            .map(({ relativePath, content }) => [
                relativePath,
                {
                    bytes: Buffer.byteLength(content, 'utf-8'),
                    sha256: sha256(content),
                },
            ]),
    );
    const capabilityExports = {
        codex: codexCapabilities,
        gemini: geminiCapabilities,
    };

    return `${JSON.stringify({
        schema_version: 1,
        plugin: {
            name: 'corvus-star',
            version,
        },
        runtime_binding: CODEX_PLUGIN_RUNTIME_BINDING,
        tool_catalog: {
            count: CSTAR_KERNEL_TOOL_NAMES.length,
            sha256: hashCanonicalJson(CSTAR_KERNEL_TOOL_CATALOG),
        },
        capability_exports: {
            codex_count: codexCapabilities.length,
            gemini_count: geminiCapabilities.length,
            sha256: hashCanonicalJson(capabilityExports),
        },
        files,
    }, null, 2)}\n`;
}

export function buildDistributions(projectRoot: string): DistributionBuild {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const metadata = loadPackageMetadata(resolvedRoot);
    const geminiCapabilities = getCapabilitiesForHost(resolvedRoot, 'gemini');
    const codexCapabilities = getCapabilitiesForHost(resolvedRoot, 'codex');
    const pluginRoot = path.join('plugins', 'corvus-star');
    const pluginFiles: GeneratedFile[] = [
        {
            relativePath: path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
            content: buildCodexPluginManifestContent(resolvedRoot),
        },
        {
            relativePath: path.join(pluginRoot, 'skills', 'corvus-star', 'SKILL.md'),
            content: buildCodexPluginSkillContent(codexCapabilities),
        },
        {
            relativePath: path.join(pluginRoot, 'README.md'),
            content: buildDistributionReadmeContent(geminiCapabilities, codexCapabilities),
        },
    ];
    const lineageFile: GeneratedFile = {
        relativePath: path.join(pluginRoot, 'lineage.json'),
        content: buildCodexPluginLineageContent(
            metadata.version ?? '0.0.0',
            pluginFiles,
            geminiCapabilities,
            codexCapabilities,
        ),
    };

    return {
        geminiCapabilities,
        codexCapabilities,
        obsoletePaths: [
            path.join(pluginRoot, '.mcp.json'),
            path.join(pluginRoot, 'hooks.json'),
            path.join(pluginRoot, 'hooks'),
            path.join(pluginRoot, 'scripts', 'cstar_codex_post_write.sh'),
        ],
        files: [
            {
                relativePath: 'gemini-extension.json',
                content: buildGeminiManifestContent(resolvedRoot),
            },
            {
                relativePath: 'GEMINI.md',
                content: buildGeminiContextContent(resolvedRoot, geminiCapabilities),
            },
            ...pluginFiles,
            lineageFile,
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

interface DistributionPromotionUnit {
    relativePath: string;
    kind: 'file' | 'directory';
}

function distributionPromotionUnits(build: DistributionBuild): DistributionPromotionUnit[] {
    const pluginRoot = path.join('plugins', 'corvus-star');
    return [
        { relativePath: pluginRoot, kind: 'directory' },
        ...build.files
            .filter((file) => !file.relativePath.startsWith(`${pluginRoot}${path.sep}`))
            .map((file) => ({ relativePath: file.relativePath, kind: 'file' as const })),
    ];
}

function expectedPluginFiles(build: DistributionBuild): string[] {
    const pluginRoot = path.join('plugins', 'corvus-star');
    return build.files
        .filter((file) => file.relativePath.startsWith(`${pluginRoot}${path.sep}`))
        .map((file) => portablePath(path.relative(pluginRoot, file.relativePath)))
        .sort((left, right) => left.localeCompare(right));
}

function preflightDistributionTargets(projectRoot: string, build: DistributionBuild): void {
    assertNoRecoveryArtifacts(
        projectRoot,
        ['.cstar-distributions.stage-', '.cstar-distributions.rollback-'],
        'generated distribution',
    );
    for (const unit of distributionPromotionUnits(build)) {
        const target = path.join(projectRoot, unit.relativePath);
        assertManagedPathSafe(projectRoot, target, `Generated distribution target ${unit.relativePath}`);
        if (!fs.existsSync(target)) continue;
        const stat = fs.lstatSync(target);
        if (unit.kind === 'directory') {
            assertRegularTree(target, `Generated distribution tree ${unit.relativePath}`);
        } else if (!stat.isFile()) {
            throw new Error(`Generated distribution target must be a regular file: ${target}`);
        }
    }
}

export function writeDistributions(projectRoot: string): GeneratedFile[] {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const build = buildDistributions(resolvedRoot);
    const units = distributionPromotionUnits(build);
    preflightDistributionTargets(resolvedRoot, build);

    const stagingRoot = fs.mkdtempSync(path.join(resolvedRoot, '.cstar-distributions.stage-'));
    const rollbackRoot = fs.mkdtempSync(path.join(resolvedRoot, '.cstar-distributions.rollback-'));
    const backedUp: DistributionPromotionUnit[] = [];
    const promoted: DistributionPromotionUnit[] = [];
    let preserveRollback = false;

    try {
        for (const file of build.files) {
            const stagedPath = path.join(stagingRoot, file.relativePath);
            fs.mkdirSync(path.dirname(stagedPath), { recursive: true });
            fs.writeFileSync(stagedPath, file.content, 'utf-8');
        }

        const stagedPluginRoot = path.join(stagingRoot, 'plugins', 'corvus-star');
        if (JSON.stringify(listRegularFiles(stagedPluginRoot)) !== JSON.stringify(expectedPluginFiles(build))) {
            throw new Error('Staged Corvus Star plugin file set is incomplete or contains unexpected files.');
        }

        for (const unit of units) {
            const target = path.join(resolvedRoot, unit.relativePath);
            if (!fs.existsSync(target)) continue;
            const backup = path.join(rollbackRoot, unit.relativePath);
            fs.mkdirSync(path.dirname(backup), { recursive: true });
            fs.renameSync(target, backup);
            backedUp.push(unit);
        }

        for (const unit of units) {
            const staged = path.join(stagingRoot, unit.relativePath);
            const target = path.join(resolvedRoot, unit.relativePath);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.renameSync(staged, target);
            promoted.push(unit);
        }
    } catch (error) {
        const recoveryErrors: unknown[] = [];
        for (const unit of [...promoted].reverse()) {
            try {
                fs.rmSync(path.join(resolvedRoot, unit.relativePath), { recursive: true, force: true });
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        for (const unit of [...backedUp].reverse()) {
            const backup = path.join(rollbackRoot, unit.relativePath);
            const target = path.join(resolvedRoot, unit.relativePath);
            try {
                fs.mkdirSync(path.dirname(target), { recursive: true });
                fs.renameSync(backup, target);
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        if (recoveryErrors.length > 0) {
            preserveRollback = true;
            throw new Error(
                `Generated distribution promotion failed and rollback was incomplete. Recovery tree preserved at ${rollbackRoot}`,
                { cause: new AggregateError([error, ...recoveryErrors]) },
            );
        }
        throw error;
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        if (!preserveRollback) {
            fs.rmSync(rollbackRoot, { recursive: true, force: true });
        }
    }

    return build.files;
}

export function validateDistributions(projectRoot: string): string[] {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const build = buildDistributions(resolvedRoot);
    const mismatches: string[] = [];
    preflightDistributionTargets(resolvedRoot, build);

    for (const file of build.files) {
        const absolutePath = path.join(resolvedRoot, file.relativePath);
        if (!fs.existsSync(absolutePath)) {
            mismatches.push(`${file.relativePath}: missing`);
            continue;
        }

        const current = fs.readFileSync(absolutePath, 'utf-8');
        if (current !== file.content) {
            mismatches.push(`${file.relativePath}: stale`);
        }
    }

    const pluginRoot = path.join(resolvedRoot, 'plugins', 'corvus-star');
    if (fs.existsSync(pluginRoot)) {
        const expected = new Set(expectedPluginFiles(build));
        for (const actual of listRegularFiles(pluginRoot)) {
            if (!expected.has(actual)) {
                mismatches.push(`${path.join('plugins', 'corvus-star', actual)}: unexpected`);
            }
        }
    }

    for (const obsoletePath of build.obsoletePaths) {
        if (
            fs.existsSync(path.join(resolvedRoot, obsoletePath))
            && !mismatches.includes(`${obsoletePath}: unexpected`)
        ) {
            mismatches.push(`${obsoletePath}: unexpected`);
        }
    }

    return mismatches;
}

export function buildReleaseBundles(projectRoot: string): ReleaseBundle[] {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const build = buildDistributions(resolvedRoot);
    const fileMap = new Map(build.files.map((file) => [file.relativePath, file]));

    const geminiContext = fileMap.get('GEMINI.md');
    if (!geminiContext) {
        throw new Error('Missing generated Gemini context file.');
    }
    const geminiFiles: GeneratedFile[] = [
        {
            relativePath: 'gemini-extension.json',
            content: buildGeminiBundleManifestContent(resolvedRoot),
        },
        geminiContext,
        {
            relativePath: path.join('scripts', 'cstar_external_runtime_mcp.mjs'),
            content: buildGeminiExternalRuntimeLauncherContent(),
        },
        {
            relativePath: 'INSTALL.md',
            content: buildGeminiBundleInstallContent(),
        },
    ];

    const codexPluginFiles = [
        path.join('plugins', 'corvus-star', '.codex-plugin', 'plugin.json'),
        path.join('plugins', 'corvus-star', 'README.md'),
        path.join('plugins', 'corvus-star', 'skills', 'corvus-star', 'SKILL.md'),
        path.join('plugins', 'corvus-star', 'lineage.json'),
    ].map((relativePath) => {
        const file = fileMap.get(relativePath);
        if (!file) {
            throw new Error(`Missing generated distribution file: ${relativePath}`);
        }
        return file;
    });
    const codexMarketplace = fileMap.get(path.join('.agents', 'plugins', 'marketplace.json'));
    if (!codexMarketplace) {
        throw new Error('Missing generated Codex marketplace file.');
    }

    return [
        {
            name: 'gemini-extension',
            rootDir: path.join('dist', 'host-distributions', 'gemini-extension'),
            runtimeBinding: GEMINI_RUNTIME_BINDING,
            files: geminiFiles,
        },
        {
            name: 'codex-plugin',
            rootDir: path.join('dist', 'host-distributions', 'codex-plugin'),
            runtimeBinding: CODEX_PLUGIN_RUNTIME_BINDING,
            files: [
                ...codexPluginFiles,
                codexMarketplace,
                {
                    relativePath: 'INSTALL.md',
                    content: buildCodexBundleInstallContent(),
                },
            ],
        },
    ];
}

export function buildReleaseBundleManifest(
    projectRoot: string,
    bundles: ReleaseBundle[] = buildReleaseBundles(projectRoot),
): ReleaseBundleManifest {
    const metadata = loadPackageMetadata(resolveProjectRoot(projectRoot));

    return {
        schema_version: 1,
        version: metadata.version ?? '0.0.0',
        bundles: bundles.map((bundle) => {
            const files = bundle.files
                .map((file) => ({
                    path: portablePath(file.relativePath),
                    bytes: Buffer.byteLength(file.content, 'utf-8'),
                    sha256: sha256(file.content),
                }))
                .sort((left, right) => left.path.localeCompare(right.path));
            return {
                name: bundle.name,
                root_dir: portablePath(bundle.rootDir),
                sha256: hashCanonicalJson({
                    files,
                    runtime_binding: bundle.runtimeBinding,
                }),
                runtime_binding: bundle.runtimeBinding,
                files,
            };
        }),
    };
}

export function writeReleaseBundles(projectRoot: string): ReleaseBundle[] {
    const resolvedRoot = resolveProjectRoot(projectRoot);
    const bundles = buildReleaseBundles(resolvedRoot);
    const distRoot = path.join(resolvedRoot, 'dist');
    const hostDistributionsRoot = path.join(distRoot, 'host-distributions');
    assertManagedPathSafe(resolvedRoot, distRoot, 'Distribution output root');
    assertManagedPathSafe(resolvedRoot, hostDistributionsRoot, 'Host-distribution output root');
    if (fs.existsSync(distRoot) && !fs.lstatSync(distRoot).isDirectory()) {
        throw new Error(`Distribution output root must be a real directory: ${distRoot}`);
    }
    assertRegularTree(hostDistributionsRoot, 'Existing host-distribution tree');
    assertNoRecoveryArtifacts(
        distRoot,
        ['.host-distributions.stage-', '.host-distributions.rollback-'],
        'host-distribution',
    );

    fs.mkdirSync(distRoot, { recursive: true });
    const stagingRoot = fs.mkdtempSync(path.join(distRoot, '.host-distributions.stage-'));
    const rollbackRoot = fs.mkdtempSync(path.join(distRoot, '.host-distributions.rollback-'));
    const rollbackTree = path.join(rollbackRoot, 'host-distributions');
    let previousMoved = false;
    let stagedPromoted = false;
    let preserveRollback = false;

    try {
        for (const bundle of bundles) {
            const bundleRoot = path.join(stagingRoot, bundle.name);
            fs.mkdirSync(bundleRoot, { recursive: true });
            for (const file of bundle.files) {
                const absolutePath = path.join(bundleRoot, file.relativePath);
                fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
                fs.writeFileSync(absolutePath, file.content, 'utf-8');
            }
        }
        fs.writeFileSync(
            path.join(stagingRoot, 'manifest.json'),
            `${JSON.stringify(buildReleaseBundleManifest(resolvedRoot, bundles), null, 2)}\n`,
            'utf-8',
        );
        assertRegularTree(stagingRoot, 'Staged host-distribution tree');

        if (fs.existsSync(hostDistributionsRoot)) {
            fs.renameSync(hostDistributionsRoot, rollbackTree);
            previousMoved = true;
        }
        fs.renameSync(stagingRoot, hostDistributionsRoot);
        stagedPromoted = true;
    } catch (error) {
        const recoveryErrors: unknown[] = [];
        if (stagedPromoted) {
            try {
                fs.rmSync(hostDistributionsRoot, { recursive: true, force: true });
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        if (previousMoved) {
            try {
                fs.renameSync(rollbackTree, hostDistributionsRoot);
            } catch (recoveryError) {
                recoveryErrors.push(recoveryError);
            }
        }
        if (recoveryErrors.length > 0) {
            preserveRollback = true;
            throw new Error(
                `Host-distribution promotion failed and rollback was incomplete. Recovery tree preserved at ${rollbackRoot}`,
                { cause: new AggregateError([error, ...recoveryErrors]) },
            );
        }
        throw error;
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        if (!preserveRollback) {
            fs.rmSync(rollbackRoot, { recursive: true, force: true });
        }
    }

    return bundles;
}
