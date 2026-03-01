/**
 * Operation PennyOne: Shared Telemetry Types
 */

/**
 * AgentPing definition
 */
export interface AgentPing {
    agent_id: string;
    action: 'SEARCH' | 'READ' | 'EDIT' | 'EVALUATE' | 'THINK';
    target_path: string;
    timestamp: number;
}

export type TraceEvent = {
    type: 'AGENT_TRACE';
    payload: AgentPing;
} | {
    type: 'NODE_UPDATED' | 'GRAPH_REBUILT';
    payload: unknown;
};
