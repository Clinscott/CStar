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

interface EntryInput {
    name: string;
    parent?: string[];
    description: string;
    aliases?: string[];
    arguments?: CommandArgumentDescriptor[];
    options?: CommandOptionDescriptor[];
    subcommands?: CommandCatalogEntry[];
}

const JSON_OPTION: CommandOptionDescriptor = {
    flags: '--json',
    description: 'Emit machine-readable JSON instead of formatted text',
};

const LIMIT_OPTION: CommandOptionDescriptor = {
    flags: '-l, --limit <n>',
    description: 'Maximum failed sessions to show',
    default_value: '5',
};

function requiredArgument(name: string): CommandArgumentDescriptor {
    return { name, required: true, variadic: false, placeholder: `<${name}>` };
}

function optionalVariadic(name: string): CommandArgumentDescriptor {
    return { name, required: false, variadic: true, placeholder: `[${name}]...` };
}

function entry(input: EntryInput): CommandCatalogEntry {
    const commandPath = [...(input.parent ?? []), input.name];
    const argumentsList = input.arguments ?? [];
    const options = input.options ?? [];
    const usageParts = [input.name, ...argumentsList.map((argument) => argument.placeholder)];
    if (options.length > 0) usageParts.push('[options]');
    const invocation = `cstar ${commandPath.join(' ')}`;
    const argumentTail = argumentsList.map((argument) => argument.placeholder).join(' ');
    const baseExample = [invocation, argumentTail].filter(Boolean).join(' ');
    const subcommands = input.subcommands ?? [];
    const examples = subcommands.length > 0
        ? subcommands.slice(0, 3).map((subcommand) => subcommand.examples[0])
        : [baseExample, ...(options.some((option) => option.flags.includes('--json'))
            ? [`${baseExample} --json`]
            : [])];

    return {
        name: input.name,
        aliases: input.aliases ?? [],
        description: input.description,
        usage: usageParts.join(' '),
        command_path: commandPath,
        arguments: argumentsList,
        options,
        supports_json: options.some((option) => option.flags.includes('--json')),
        subcommands,
        examples,
    };
}

function inspectionSubcommand(
    parent: 'trace' | 'augury',
    name: string,
    description: string,
    options: CommandOptionDescriptor[] = [JSON_OPTION],
): CommandCatalogEntry {
    return entry({ name, parent: [parent], description, options });
}

const TRACE_SUBCOMMANDS = [
    inspectionSubcommand('trace', 'status', 'Show the active planning or runtime trace summary from Hall'),
    inspectionSubcommand('trace', 'handoff', 'Show the active trace as an agent-ready handoff packet'),
    inspectionSubcommand('trace', 'failures', 'List recent failed planning sessions from Hall', [LIMIT_OPTION, JSON_OPTION]),
];

const AUGURY_SUBCOMMANDS = [
    inspectionSubcommand('augury', 'status', 'Show the active planning or runtime Augury summary from Hall'),
    inspectionSubcommand('augury', 'handoff', 'Show the active Augury as an agent-ready handoff packet'),
    inspectionSubcommand('augury', 'failures', 'List recent failed planning sessions as Augury recovery leads', [LIMIT_OPTION, JSON_OPTION]),
    inspectionSubcommand('augury', 'doctor', 'Diagnose whether active Augury state is safe for routing'),
    inspectionSubcommand('augury', 'explain', 'Explain the active Augury route, scope, expert, and Mimir basis'),
];

/**
 * Pure metadata for the explicit cstar.ts surface. No Commander program or
 * registrar is constructed while capability discovery reads this catalog.
 */
const COMMAND_CATALOG: CommandCatalogEntry[] = [
    entry({
        name: 'status',
        description: 'Read the local projected framework status without dispatching work',
        options: [JSON_OPTION],
    }),
    entry({
        name: 'manifest',
        description: 'List registered capabilities',
        options: [
            JSON_OPTION,
            { flags: '--scope <scope>', description: 'Capability source: hub, spoke, or all' },
            { flags: '--spoke <slug>', description: 'Narrow spoke capability discovery to this slug' },
        ],
    }),
    entry({
        name: 'skill-info',
        description: 'Inspect a registered capability mandate',
        arguments: [requiredArgument('name')],
        options: [
            JSON_OPTION,
            { flags: '--spoke <slug>', description: 'Override the spoke slug parsed from the id' },
        ],
    }),
    entry({
        name: 'trace',
        description: 'Compatibility alias for active Hall-backed Augury/runtime state',
        subcommands: TRACE_SUBCOMMANDS,
    }),
    entry({
        name: 'augury',
        description: 'Inspect active Hall-backed Corvus Star Augury state',
        subcommands: AUGURY_SUBCOMMANDS,
    }),
    entry({
        name: 'run-skill',
        description: 'Retired: use the active host skill surface or cstar-kernel MCP',
        arguments: [requiredArgument('id')],
    }),
    ...['orchestrate', 'evolve', 'evolve-temporal', 'forge'].map((name) => entry({
        name,
        description: 'Retired: use typed cstar-kernel lifecycle tools',
        arguments: [optionalVariadic('args')],
    })),
];

function cloneEntry(source: CommandCatalogEntry): CommandCatalogEntry {
    return {
        ...source,
        aliases: [...source.aliases],
        command_path: [...source.command_path],
        arguments: source.arguments.map((argument) => ({ ...argument })),
        options: source.options.map((option) => ({ ...option })),
        subcommands: source.subcommands.map(cloneEntry),
        examples: [...source.examples],
    };
}

export function getCommandCatalog(): CommandCatalogEntry[] {
    return COMMAND_CATALOG.map(cloneEntry);
}

export function findCommandCatalogEntry(commandName: string): CommandCatalogEntry | null {
    const normalized = commandName.trim().toLowerCase();
    if (!normalized) return null;

    const match = COMMAND_CATALOG.find((candidate) => (
        candidate.name.toLowerCase() === normalized
        || candidate.aliases.some((alias) => alias.toLowerCase() === normalized)
    ));
    return match ? cloneEntry(match) : null;
}
