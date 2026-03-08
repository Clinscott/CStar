export declare class GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
    gravity: number;
    stability: number;
    coupling: number;
    aesthetic: number;
    anomaly: number;
    sovereignty: number;
    vigil?: number;
}
export declare class FileData {
    path: string;
    loc: number;
    complexity: number;
    matrix: GungnirMatrix;
    imports: {
        source: string;
        local: string;
        imported: string;
    }[];
    exports: string[];
    intent?: string;
    interaction_protocol?: string;
    hash: string;
    endpoints?: string[];
    is_api?: boolean;
    cachedDependencies?: string[];
    dependencies?: string[];
    justification?: string;
}
export declare class AgentPing {
    agent_id: string;
    action: 'SEARCH' | 'READ' | 'EDIT' | 'EVALUATE' | 'THINK';
    target_path: string;
    timestamp: number;
}
export declare class ScanResult {
    path: string;
    data: FileData;
}
export declare class CompiledGraph {
    version: string;
    scanned_at: string;
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
    }>;
    summary: {
        total_files: number;
        total_loc: number;
        average_score: number;
    };
}
