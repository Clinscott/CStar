import type {
    CommandArgumentDescriptor,
    CommandOptionDescriptor,
} from './command_catalog.js';
import type { EntrySurface } from '../runtime/entry_surface.js';

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
