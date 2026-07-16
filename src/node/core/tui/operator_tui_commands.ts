import type { RuntimeDispatchPort } from '../runtime/contracts.js';

export type OperatorEventLevel = 'INFO' | 'WARN' | 'FAIL' | 'PASS';

export interface OperatorEvent {
    at: number;
    level: OperatorEventLevel;
    message: string;
    detail?: string;
}

export type OperatorTab = 'OVERVIEW' | 'BLACKBOARD' | 'AGENTS' | 'TERMINALS';

export interface OperatorInputResult {
    events: OperatorEvent[];
    exit?: boolean;
    planningSessionId?: string;
    activeTab: OperatorTab;
}

export const TUI_ACTION_RETIRED_ERROR =
    'legacy_tui_action_retired_use_cstar_kernel';

function event(
    level: OperatorEventLevel,
    message: string,
    detail?: string,
): OperatorEvent[] {
    return [{ at: Date.now(), level, message, detail }];
}

/**
 * Preserve passive shell navigation while failing every action-bearing input
 * closed. The compatibility arguments are deliberately unused: this function
 * does not resolve state, query Hall, touch files, invoke providers, dispatch
 * runtime work, or call a supplied callback.
 */
export async function dispatchOperatorInput(
    rawInput: string,
    _dispatchPort: RuntimeDispatchPort,
    workspaceRoot: string,
    activeTab: OperatorTab,
    activePlanningSessionId?: string,
): Promise<OperatorInputResult> {
    const normalized = rawInput.trim();
    const lower = normalized.toLowerCase();

    if (!normalized) {
        return {
            events: event('INFO', 'Refresh requested.', workspaceRoot),
            activeTab,
            planningSessionId: activePlanningSessionId,
        };
    }
    if (lower === 'exit' || lower === 'quit') {
        return { events: event('PASS', 'Operator shell closing.'), exit: true, activeTab };
    }
    if (lower === 'clear') {
        return { events: event('INFO', 'Event crawl cleared.'), activeTab };
    }

    const tabs: Record<string, OperatorTab> = {
        '1': 'OVERVIEW',
        overview: 'OVERVIEW',
        '2': 'BLACKBOARD',
        blackboard: 'BLACKBOARD',
        '3': 'AGENTS',
        agents: 'AGENTS',
        '4': 'TERMINALS',
        terminals: 'TERMINALS',
    };
    const selectedTab = tabs[lower];
    if (selectedTab) {
        return {
            events: event('INFO', `Tab: ${selectedTab}`),
            activeTab: selectedTab,
            planningSessionId: activePlanningSessionId,
        };
    }
    if (lower === 'status' || lower === 'hall') {
        return {
            events: event('PASS', 'Read-only operator refresh requested.', lower),
            activeTab,
            planningSessionId: activePlanningSessionId,
        };
    }

    return {
        events: event('FAIL', 'Operator action unavailable.', TUI_ACTION_RETIRED_ERROR),
        activeTab,
        planningSessionId: activePlanningSessionId,
    };
}
