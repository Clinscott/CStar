export const RETIRED_SEMANTIC_INDEXER_ERROR =
    'legacy_semantic_indexer_retired_use_cstar_hall_surfaces';

export interface SemanticSymbol {
    name: string;
    kind: string;
    line: number;
    path: string;
}

export interface SemanticFileResult {
    path: string;
    dependencies: string[];
    symbols: unknown[];
    logic: number;
    cluster?: number;
}

export class SemanticIndexer {
    public constructor(root: string) {
        void root;
    }

    public async index(manualFiles?: string[]): Promise<never> {
        void manualFiles;
        throw new Error(RETIRED_SEMANTIC_INDEXER_ERROR);
    }

    public async focusSymbol(filepath: string, symbolName: string): Promise<never> {
        void filepath;
        void symbolName;
        throw new Error(RETIRED_SEMANTIC_INDEXER_ERROR);
    }
}
