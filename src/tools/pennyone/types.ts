import type { GungnirMatrix } from  '../../types/gungnir.js';

export interface FileData {
    path: string;
    loc: number;
    complexity: number;
    matrix: GungnirMatrix;
    imports: { source: string; local: string; imported: string }[];
    exports: string[];
    intent?: string;
    interaction_protocol?: string;
    hash: string;
    endpoints?: string[];
    is_api?: boolean;
    cachedDependencies?: string[];
    dependencies?: string[];
    cluster?: number;
    justification?: string;
}

export interface AgentPing {
    agent_id: string;
    action: 'SEARCH' | 'READ' | 'EDIT' | 'EVALUATE' | 'THINK';
    target_path: string;
    timestamp: number;
}

export interface ScanResult {
    path: string;
    data: FileData;
}

export interface CompiledGraph {
    version: string;
    scanned_at: string;
    projection?: {
        authority: 'hall_projection' | 'runtime_scan';
        repo_root: string;
        scan_id?: string;
        artifact_role: 'runtime_view' | 'compatibility_export';
    };
    files: Array<{
        path: string;
        loc: number;
        complexity: number;
        matrix: GungnirMatrix;
        intent: string;
        interaction_protocol?: string;
        dependencies: string[];
        hash: string;
        endpoints?: string[];
        is_api?: boolean;
        cluster?: number;
    }>;
    summary: {
        total_files: number;
        total_loc: number;
        average_score: number;
    };
}

export interface EstateTopologyNode {
    id: string;
    label: string;
    kind: 'brain' | 'spoke';
    root_path: string;
    status: string;
    baseline_gungnir_score: number;
    open_beads: number;
    validation_runs: number;
    mount_status?: string;
    trust_level?: string;
    projection_status?: string;
}

export interface EstateTopologyEdge {
    source: string;
    target: string;
    relation: 'mounted_spoke';
}

export interface EstateTopologyPayload {
    generated_at: string;
    brain_id: string;
    nodes: EstateTopologyNode[];
    edges: EstateTopologyEdge[];
}
