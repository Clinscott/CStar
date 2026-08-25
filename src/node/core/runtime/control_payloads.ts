export interface StartWeavePayload {
    target?: string;
    task: string;
    ledger: string;
    loki?: boolean;
    debug?: boolean;
    verbose?: boolean;
}

export interface HostGovernorPolicy {
    max_total_targets: number;
    max_implementation_targets: number;
    max_acceptance_items: number;
    max_acceptance_item_length: number;
    max_implementation_lines: number;
    max_total_target_lines: number;
}

export interface HostGovernorWeavePayload {
    task?: string;
    ledger?: string;
    auto_execute?: boolean;
    auto_replan_blocked?: boolean;
    max_parallel?: number;
    max_promotions?: number;
    dry_run?: boolean;
    project_root?: string;
    cwd?: string;
    source?: 'cli' | 'runtime';
    policy?: Partial<HostGovernorPolicy>;
}

export type RavensAction = 'start' | 'stop' | 'status' | 'cycle' | 'sweep';

export interface RavensWeavePayload {
    action: RavensAction;
    shadow_forge?: boolean;
    spoke?: string;
    host_supervision?: boolean;
}
