import * as d3 from 'd3-force-3d';

export interface Node extends d3.SimulationNodeDatum {
    id: string | number;
    path: string;
    loc?: number;
    complexity?: number;
    matrix: Record<string, unknown>;
    intent: string;
    interactionProtocol?: string;
    type: 'PYTHON' | 'LOGIC';
    x?: number;
    y?: number;
    z?: number;
    gravity?: number;
    cluster?: number;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
    source: string | number | Node;
    target: string | number | Node;
}

export interface Trajectory {
    timestamp: string;
    initial_score: number;
    final_score: number;
    justification: string;
}

export interface GhostTrace {
    id: string;
    points: [number, number, number][];
    activeNodeId: string | number | null;
    timestamp: number;
}
