import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';

import {
    findCommandCatalogEntry,
    type CommandArgumentDescriptor,
    type CommandCatalogEntry,
    type CommandOptionDescriptor,
} from './command_catalog.js';
import { resolveEntrySurface, type EntrySurface } from '../runtime/entry_surface.js';

const TEXT_DOC_EXTENSIONS = new Set(['.md', '.qmd', '.feature', '.txt']);

export interface CapabilityRegistryEntry {
    tier?: string;
    description?: string;
    viability?: string;
    risk?: string;
    runtime_trigger?: string;
    instruction_path?: string;
    authority_path?: string;
    entrypoint_path?: string | null;
    contract_path?: string | null;
    contracts?: string[];
    tests?: string[];
    owner_runtime?: string;
    recursion_policy?: string;
    entry_surface?: string;
    host_support?: Record<string, string>;
    execution?: {
        mode?: string;
        cli?: string;
        adapter_id?: string;
        ownership_model?: string;
    };
}

export interface CapabilityRegistryManifest {
    generated_at?: number;
    entries?: Record<string, CapabilityRegistryEntry>;
    skills?: Record<string, CapabilityRegistryEntry>;
}

export interface CapabilitySummary {
    id: string;
    tier: string;
    description: string;
    viability: string;
    risk: string;
    runtime_trigger: string;
    entry_surface: EntrySurface;
    shell_command: string | null;
    runtime_adapter_id: string;
    runtime_aliases: string[];
    active_in_runtime: boolean;
    invoke: CapabilityInvokeMetadata;
    execution_mode: string;
    ownership_model: string | null;
    owner_runtime: string | null;
    recursion_policy: string | null;
    authority_path: string | null;
    instruction_path: string | null;
    entrypoint_path: string | null;
    contract_path: string | null;
    contracts: string[];
    tests: string[];
    host_support: Record<string, string>;
}

export interface CapabilityDocumentation {
    kind: 'markdown' | 'gherkin' | 'source' | 'none';
    path: string | null;
    readable: boolean;
    content: string | null;
}

export interface CapabilityInvokeSubcommand {
    name: string;
    aliases: string[];
    description: string;
    usage: string;
    command_path: string[];
    arguments: CommandArgumentDescriptor[];
    options: CommandOptionDescriptor[];
    supports_json: boolean;
    examples: string[];
}

export interface CapabilityInvokeMetadata {
    source: 'commander' | 'inferred' | 'unavailable';
    shell_command: string | null;
    command_path: string[];
    aliases: string[];
    description: string | null;
    usage: string | null;
    arguments: CommandArgumentDescriptor[];
    options: CommandOptionDescriptor[];
    supports_json: boolean;
    subcommands: CapabilityInvokeSubcommand[];
    examples: string[];
}

export interface CapabilityManifestPayload {
    generated_at: number | null;
    capabilities: CapabilitySummary[];
}

export interface CapabilityInfoPayload {
    capability: CapabilitySummary;
    documentation: CapabilityDocumentation;
}

function getRegistryEntries(manifest: CapabilityRegistryManifest): Record<string, CapabilityRegistryEntry> {
    if (manifest.entries && typeof manifest.entries === 'object') {
        return manifest.entries;
    }
    if (manifest.skills && typeof manifest.skills === 'object') {
        return manifest.skills;
    }
    return {};
}

function toStringValue(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function toStringList(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean);
}

function uniq(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        ordered.push(value);
    }
    return ordered;
}

function resolveProjectPath(projectRoot: string, targetPath: string): string {
    return path.isAbsolute(targetPath) ? targetPath : path.join(projectRoot, targetPath);
}

function existsInProject(projectRoot: string, targetPath: string | null): boolean {
    if (!targetPath) {
        return false;
    }
    return fs.existsSync(resolveProjectPath(projectRoot, targetPath));
}

function isTextDocumentation(targetPath: string): boolean {
    return TEXT_DOC_EXTENSIONS.has(path.extname(targetPath).toLowerCase());
}

function resolveRuntimeTrigger(entry: CapabilityRegistryEntry, capabilityId: string): string {
    return toStringValue(entry.runtime_trigger) ?? capabilityId;
}

function resolveRuntimeAdapterId(entry: CapabilityRegistryEntry, capabilityId: string): string {
    return toStringValue(entry.execution?.adapter_id) ?? capabilityId;
}

function resolveRuntimeAliases(entry: CapabilityRegistryEntry, capabilityId: string): string[] {
    const runtimeTrigger = resolveRuntimeTrigger(entry, capabilityId);
    const tier = String(entry.tier ?? '').trim().toUpperCase();
    return uniq([
        resolveRuntimeAdapterId(entry, capabilityId),
        capabilityId,
        runtimeTrigger,
        tier === 'WEAVE' ? `weave:${capabilityId}` : null,
        tier === 'WEAVE' && runtimeTrigger !== capabilityId ? `weave:${runtimeTrigger}` : null,
    ]);
}

function resolveShellCommand(entry: CapabilityRegistryEntry, capabilityId: string, surface: EntrySurface): string | null {
    const explicit = toStringValue(entry.execution?.cli);
    if (explicit) {
        return explicit;
    }
    if (surface === 'cli' && String(entry.viability ?? 'ACTIVE').trim().toUpperCase() === 'ACTIVE') {
        return `cstar ${resolveRuntimeTrigger(entry, capabilityId)}`;
    }
    return null;
}

function parseShellCommandPath(shellCommand: string | null): string[] {
    if (!shellCommand) {
        return [];
    }

    const tokens = shellCommand.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
        return [];
    }
    if (tokens[0] === 'cstar') {
        return tokens.slice(1);
    }
    return tokens;
}

function toInvokeSubcommand(entry: CommandCatalogEntry): CapabilityInvokeSubcommand {
    return {
        name: entry.name,
        aliases: [...entry.aliases],
        description: entry.description,
        usage: entry.usage,
        command_path: [...entry.command_path],
        arguments: entry.arguments.map((argument) => ({ ...argument })),
        options: entry.options.map((option) => ({ ...option })),
        supports_json: entry.supports_json,
        examples: [...entry.examples],
    };
}

function buildInvokeMetadata(
    entry: CapabilityRegistryEntry,
    capabilityId: string,
    surface: EntrySurface,
): CapabilityInvokeMetadata {
    const shellCommand = resolveShellCommand(entry, capabilityId, surface);
    const commandPath = parseShellCommandPath(shellCommand);
    const primaryCommand = commandPath[0] ?? resolveRuntimeTrigger(entry, capabilityId);
    const commandSpec = primaryCommand ? findCommandCatalogEntry(primaryCommand) : null;

    if (commandSpec) {
        return {
            source: 'commander',
            shell_command: shellCommand,
            command_path: [...commandSpec.command_path],
            aliases: [...commandSpec.aliases],
            description: commandSpec.description,
            usage: commandSpec.usage,
            arguments: commandSpec.arguments.map((argument) => ({ ...argument })),
            options: commandSpec.options.map((option) => ({ ...option })),
            supports_json: commandSpec.supports_json,
            subcommands: commandSpec.subcommands.map(toInvokeSubcommand),
            examples: [...commandSpec.examples],
        };
    }

    if (shellCommand) {
        return {
            source: 'inferred',
            shell_command: shellCommand,
            command_path: commandPath,
            aliases: [],
            description: null,
            usage: commandPath.length > 0 ? commandPath.join(' ') : null,
            arguments: [],
            options: [],
            supports_json: false,
            subcommands: [],
            examples: [shellCommand],
        };
    }

    return {
        source: 'unavailable',
        shell_command: null,
        command_path: [],
        aliases: [],
        description: null,
        usage: null,
        arguments: [],
        options: [],
        supports_json: false,
        subcommands: [],
        examples: [],
    };
}

function resolveCapabilitySummary(
    capabilityId: string,
    entry: CapabilityRegistryEntry,
    activeAdapterIds: Set<string>,
): CapabilitySummary {
    const surface = resolveEntrySurface(entry, capabilityId);
    const runtimeAliases = resolveRuntimeAliases(entry, capabilityId);
    return {
        id: capabilityId,
        tier: String(entry.tier ?? 'UNKNOWN'),
        description: String(entry.description ?? '').trim(),
        viability: String(entry.viability ?? 'UNKNOWN').trim(),
        risk: String(entry.risk ?? 'unknown').trim(),
        runtime_trigger: resolveRuntimeTrigger(entry, capabilityId),
        entry_surface: surface,
        shell_command: resolveShellCommand(entry, capabilityId, surface),
        runtime_adapter_id: resolveRuntimeAdapterId(entry, capabilityId),
        runtime_aliases: runtimeAliases,
        active_in_runtime: runtimeAliases.some((alias) => activeAdapterIds.has(alias)),
        invoke: buildInvokeMetadata(entry, capabilityId, surface),
        execution_mode: String(entry.execution?.mode ?? 'unknown').trim(),
        ownership_model: toStringValue(entry.execution?.ownership_model),
        owner_runtime: toStringValue(entry.owner_runtime),
        recursion_policy: toStringValue(entry.recursion_policy),
        authority_path: toStringValue(entry.authority_path),
        instruction_path: toStringValue(entry.instruction_path),
        entrypoint_path: toStringValue(entry.entrypoint_path),
        contract_path: toStringValue(entry.contract_path),
        contracts: toStringList(entry.contracts),
        tests: toStringList(entry.tests),
        host_support: typeof entry.host_support === 'object' && entry.host_support
            ? Object.fromEntries(
                Object.entries(entry.host_support)
                    .filter((item): item is [string, string] => typeof item[0] === 'string' && typeof item[1] === 'string'),
            )
            : {},
    };
}

function resolveCapabilityDocumentation(projectRoot: string, summary: CapabilitySummary): CapabilityDocumentation {
    const weaveDoc = `.agents/weaves/${summary.id}.md`;
    const spellDoc = `.agents/spells/${summary.id}.md`;
    const skillDoc = `.agents/skills/${summary.id}/SKILL.md`;
    const textCandidates = uniq([
        summary.tier.toUpperCase() === 'WEAVE' ? weaveDoc : null,
        summary.tier.toUpperCase() === 'SPELL' ? spellDoc : null,
        summary.instruction_path,
        ...summary.contracts,
        summary.contract_path,
        summary.authority_path,
        skillDoc,
        weaveDoc,
        spellDoc,
    ]);

    for (const candidate of textCandidates) {
        if (!existsInProject(projectRoot, candidate) || !isTextDocumentation(candidate)) {
            continue;
        }
        const kind = path.extname(candidate).toLowerCase() === '.feature' ? 'gherkin' : 'markdown';
        return {
            kind,
            path: candidate,
            readable: true,
            content: fs.readFileSync(resolveProjectPath(projectRoot, candidate), 'utf-8'),
        };
    }

    const sourceCandidates = uniq([
        summary.instruction_path,
        summary.contract_path,
        summary.entrypoint_path,
        summary.authority_path,
    ]);
    for (const candidate of sourceCandidates) {
        if (!existsInProject(projectRoot, candidate)) {
            continue;
        }
        return {
            kind: 'source',
            path: candidate,
            readable: false,
            content: null,
        };
    }

    return {
        kind: 'none',
        path: null,
        readable: false,
        content: null,
    };
}

export function loadCapabilityRegistryManifest(projectRoot: string): CapabilityRegistryManifest {
    const manifestPath = path.join(projectRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`Capability registry not found at ${manifestPath}.`);
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as CapabilityRegistryManifest;
}

export function buildCapabilityManifestPayload(
    projectRoot: string,
    activeAdapterIds: Iterable<string> = [],
): CapabilityManifestPayload {
    const manifest = loadCapabilityRegistryManifest(projectRoot);
    const activeIds = new Set(activeAdapterIds);
    const capabilities = Object.entries(getRegistryEntries(manifest))
        .map(([capabilityId, entry]) => resolveCapabilitySummary(capabilityId, entry, activeIds))
        .sort((left, right) => left.id.localeCompare(right.id));

    return {
        generated_at: typeof manifest.generated_at === 'number' ? manifest.generated_at : null,
        capabilities,
    };
}

export function buildCapabilityInfoPayload(
    projectRoot: string,
    capabilityName: string,
    activeAdapterIds: Iterable<string> = [],
): CapabilityInfoPayload | null {
    const manifest = loadCapabilityRegistryManifest(projectRoot);
    const entries = getRegistryEntries(manifest);
    const normalized = capabilityName.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    let resolved: [string, CapabilityRegistryEntry] | null = null;
    for (const [capabilityId, entry] of Object.entries(entries)) {
        if (capabilityId.toLowerCase() === normalized) {
            resolved = [capabilityId, entry];
            break;
        }
        const runtimeTrigger = resolveRuntimeTrigger(entry, capabilityId).toLowerCase();
        if (runtimeTrigger === normalized) {
            resolved = [capabilityId, entry];
            break;
        }
    }

    if (!resolved) {
        return null;
    }

    const capability = resolveCapabilitySummary(resolved[0], resolved[1], new Set(activeAdapterIds));
    return {
        capability,
        documentation: resolveCapabilityDocumentation(projectRoot, capability),
    };
}

export function renderCapabilityManifestLines(payload: CapabilityManifestPayload): string[] {
    const lines = [
        chalk.cyan('\n ◤ CAPABILITY MANIFEST ◢ '),
        chalk.dim('━'.repeat(60)),
    ];

    if (payload.generated_at) {
        lines.push(chalk.dim(`generated_at=${new Date(payload.generated_at).toISOString()}`));
    }

    for (const capability of payload.capabilities) {
        const status = capability.active_in_runtime ? chalk.green('ACTIVE') : chalk.dim('CATALOGED');
        const surface = chalk.magenta(capability.entry_surface.padEnd(12));
        const invocation = capability.shell_command
            ? chalk.blue(capability.shell_command)
            : chalk.dim(capability.runtime_adapter_id);
        lines.push(`  ${chalk.white(capability.id.padEnd(25))} [${status}] ${chalk.yellow(capability.tier.padEnd(6))} ${surface} ${invocation}`);
    }

    lines.push(chalk.dim('\n' + '━'.repeat(60) + '\n'));
    return lines;
}

export function renderCapabilityInfoLines(payload: CapabilityInfoPayload): string[] {
    const { capability, documentation } = payload;
    const lines = [
        chalk.cyan(`\n ◤ CAPABILITY: ${capability.id.toUpperCase()} ◢ `),
        chalk.dim('━'.repeat(60)),
        chalk.dim(`tier=${capability.tier} surface=${capability.entry_surface} active=${capability.active_in_runtime}`),
        chalk.dim(`runtime_trigger=${capability.runtime_trigger} adapter=${capability.runtime_adapter_id}`),
        chalk.dim(`execution_mode=${capability.execution_mode} ownership=${capability.ownership_model ?? 'unknown'} owner_runtime=${capability.owner_runtime ?? 'unknown'}`),
    ];

    if (capability.shell_command) {
        lines.push(chalk.dim(`invoke=${capability.shell_command}`));
    }
    if (capability.invoke.subcommands.length > 0) {
        lines.push(chalk.dim(`subcommands=${capability.invoke.subcommands.map((subcommand) => subcommand.name).join(', ')}`));
    }
    if (capability.authority_path) {
        lines.push(chalk.dim(`authority=${capability.authority_path}`));
    }
    if (capability.description) {
        lines.push(chalk.dim(`description=${capability.description}`));
    }
    if (capability.contracts.length > 0) {
        lines.push(chalk.dim(`contracts=${capability.contracts.join(', ')}`));
    }
    if (capability.tests.length > 0) {
        lines.push(chalk.dim(`tests=${capability.tests.join(', ')}`));
    }

    if (documentation.readable && documentation.content) {
        lines.push(chalk.dim(`documentation=${documentation.path}`));
        lines.push('');
        lines.push(documentation.content);
    } else if (documentation.kind === 'source' && documentation.path) {
        lines.push(chalk.dim(`documentation=source-authority:${documentation.path}`));
        lines.push(chalk.dim('No markdown or Gherkin contract is registered for this capability.'));
    } else {
        lines.push(chalk.dim('documentation=none'));
    }

    lines.push(chalk.dim('━'.repeat(60) + '\n'));
    return lines;
}
