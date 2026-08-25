import type { SovereignState } from './state.js';

/** Build inert compatibility state before any Hall projection is available. */
export function buildDefaultSovereignState(): SovereignState {
    return {
        framework: {
            status: 'DORMANT',
            last_awakening: 0,
            active_persona: '',
            gungnir_score: 0,
            intent_integrity: 0,
        },
        identity: {
            name: 'CStar',
            tagline: 'Corvus estate control plane.',
            guiding_principles: [
                'Operator authority and platform safety come first.',
                'Lifecycle changes are recorded through CStar.',
                'Capabilities are skill-first and independently validated.',
                'Observed runtime and source evidence are reported separately.',
            ],
            use_systems: {
                interface: 'cstar-kernel MCP',
                orchestration: 'CStar lifecycle',
                intelligence: 'Forge and Researcher request lanes',
                memory: 'Hall of Records',
                visualization: 'PennyOne and console mirrors',
            },
        },
        hall_of_records: {
            description: 'Canonical CStar lifecycle and evidence ledger.',
            primary_assets: {
                database: '.stats/pennyone.db (Canonical Hall of Records)',
                contracts: '.agents/skills/*.feature (Behavioral Contracts)',
                lore: 'documentation and bounded evidence artifacts',
                history: 'bead and validation receipts',
            },
        },
        managed_spokes: [],
        operator_console: {
            default_entrypoint: 'cli',
            preferred_prompt_position: 'top',
            verbose_stream: false,
            theme: 'matrix',
        },
        agents: {},
        blackboard: [],
        terminal_logs: [],
    };
}
