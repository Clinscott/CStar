export interface SemanticSymbol {
    name: string;
    kind: string;
    line: number;
    path: string;
}
/**
 * PennyOne Semantic Indexer (v2.0)
 * Purpose: Transition from heuristic string matching to symbol-aware dependency resolution.
 * Mandate: Linscott Standard / SCIP Alignment
 */
export declare class SemanticIndexer {
    private root;
    private symbolRegistry;
    constructor(root: string);
    index(manualFiles?: string[]): Promise<{
        version: string;
        scanned_at: string;
        files: {
            path: string;
            dependencies: string[];
            symbols: any[];
            logic: number;
        }[];
    }>;
    private extractDefinitions;
    private analyzeSemantically;
}
