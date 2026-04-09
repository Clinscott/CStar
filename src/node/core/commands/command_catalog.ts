import { Command, type Option } from 'commander';

import { registerBifrostCommand } from './bifrost.js';
import { registerCapabilityDiscoveryCommands } from './capability_discovery_commands.js';
import { registerHallDocumentCommand } from './hall-doc.js';
import { registerOneMindCommand } from './one-mind.js';
import { registerOracleCommand } from './oracle.js';
import { registerOsCommands } from './os-integration.js';
import { registerPennyOneCommand } from './pennyone.js';
import { registerRavenCommand } from './ravens.js';
import { registerRunSkillCommand } from './run-skill.js';
import { registerSpokeCommand } from './spoke.js';
import { registerStartCommand } from './start.js';
import { registerTraceCommand } from './trace.js';
import { registerTuiCommand } from './tui.js';
import { registerVitalsCommand } from './vitals.js';
import type { RuntimeDispatchPort, WeaveInvocation, WeaveResult } from '../runtime/contracts.js';
import type { SkillBead } from '../skills/types.js';

export interface CommandArgumentDescriptor {
    name: string;
    required: boolean;
    variadic: boolean;
    placeholder: string;
}

export interface CommandOptionDescriptor {
    flags: string;
    description: string;
    default_value?: unknown;
}

export interface CommandCatalogEntry {
    name: string;
    aliases: string[];
    description: string;
    usage: string;
    command_path: string[];
    arguments: CommandArgumentDescriptor[];
    options: CommandOptionDescriptor[];
    supports_json: boolean;
    subcommands: CommandCatalogEntry[];
    examples: string[];
}

const NOOP_DISPATCH_PORT: RuntimeDispatchPort = {
    async dispatch<T>(_invocation: WeaveInvocation<T> | SkillBead<T>): Promise<WeaveResult> {
        return {
            weave_id: 'noop',
            status: 'SUCCESS',
            output: '',
        };
    },
};

let cachedCatalog: CommandCatalogEntry[] | null = null;

function formatArgument(argument: {
    name(): string;
    required: boolean;
    variadic: boolean;
}): CommandArgumentDescriptor {
    const token = argument.required ? `<${argument.name()}>` : `[${argument.name()}]`;
    return {
        name: argument.name(),
        required: argument.required,
        variadic: argument.variadic,
        placeholder: argument.variadic ? `${token}...` : token,
    };
}

function formatOption(option: Option): CommandOptionDescriptor {
    return {
        flags: option.flags,
        description: option.description ?? '',
        default_value: option.defaultValue,
    };
}

function buildExamples(entry: Omit<CommandCatalogEntry, 'examples' | 'subcommands'> & { subcommands: CommandCatalogEntry[] }): string[] {
    const root = `cstar ${entry.command_path.join(' ')}`.trim();
    if (!root) {
        return [];
    }

    const examples: string[] = [];
    const baseWithArgs = [root, ...entry.arguments.map((argument) => argument.placeholder)].join(' ').trim();

    if (entry.subcommands.length > 0) {
        for (const subcommand of entry.subcommands.slice(0, 3)) {
            if (subcommand.examples.length > 0) {
                examples.push(subcommand.examples[0]);
            } else {
                examples.push(`cstar ${subcommand.command_path.join(' ')}`.trim());
            }
        }
    } else {
        examples.push(baseWithArgs);
        if (entry.supports_json) {
            examples.push(`${baseWithArgs} --json`);
        }
    }

    return Array.from(new Set(examples.filter(Boolean)));
}

function extractCommandEntry(command: Command, parentPath: string[] = []): CommandCatalogEntry {
    const commandPath = [...parentPath, command.name()];
    const argumentsList = command.registeredArguments.map(formatArgument);
    const options = command.options.map(formatOption);
    const subcommands = command.commands
        .filter((subcommand) => subcommand.name() !== 'help')
        .map((subcommand) => extractCommandEntry(subcommand, commandPath));

    const entry: Omit<CommandCatalogEntry, 'examples'> & { examples?: string[] } = {
        name: command.name(),
        aliases: command.aliases(),
        description: command.description() ?? '',
        usage: command.usage(),
        command_path: commandPath,
        arguments: argumentsList,
        options,
        supports_json: options.some((option) => option.flags.includes('--json')),
        subcommands,
    };
    entry.examples = buildExamples(entry as CommandCatalogEntry);
    return entry as CommandCatalogEntry;
}

function buildCommandCatalog(): CommandCatalogEntry[] {
    const program = new Command();
    const workspaceRoot = '/tmp/corvus';

    registerStartCommand(program, workspaceRoot, NOOP_DISPATCH_PORT);
    registerPennyOneCommand(program, workspaceRoot, NOOP_DISPATCH_PORT);
    registerRavenCommand(program, workspaceRoot, NOOP_DISPATCH_PORT);
    registerVitalsCommand(program);
    registerBifrostCommand(program);
    registerOracleCommand(program, workspaceRoot);
    registerOneMindCommand(program, workspaceRoot);
    registerTraceCommand(program, workspaceRoot);
    registerHallDocumentCommand(program);
    registerCapabilityDiscoveryCommands(program);
    registerRunSkillCommand(program);
    registerTuiCommand(program);
    registerSpokeCommand(program, workspaceRoot);
    registerOsCommands(program);

    return program.commands
        .filter((command) => command.name() !== 'help')
        .map((command) => extractCommandEntry(command));
}

export function getCommandCatalog(): CommandCatalogEntry[] {
    if (!cachedCatalog) {
        cachedCatalog = buildCommandCatalog();
    }
    return cachedCatalog;
}

export function findCommandCatalogEntry(commandName: string): CommandCatalogEntry | null {
    const normalized = commandName.trim().toLowerCase();
    if (!normalized) {
        return null;
    }

    for (const entry of getCommandCatalog()) {
        if (entry.name.toLowerCase() === normalized) {
            return entry;
        }
        if (entry.aliases.some((alias) => alias.toLowerCase() === normalized)) {
            return entry;
        }
    }

    return null;
}
