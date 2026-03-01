import React from 'react';
import * as THREE from 'three';
interface AgentTrace {
    agent_id: string;
    target_path: string;
    timestamp: number;
}
interface AgentGhostProps {
    trace: AgentTrace[];
    nodeRegistry: Map<string, THREE.Vector3>;
}
/**
 * AgentGhost: The visual representation of the AI's journey.
 * @param root0
 * @param root0.trace
 * @param root0.nodeRegistry
 */
export declare const AgentGhost: React.FC<AgentGhostProps>;
export {};
