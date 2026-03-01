export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
    gravity: number;
}
export interface FileData {
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
    hash: string;
    endpoints?: string[];
    is_api?: boolean;
    cachedDependencies?: string[];
}
/**
 * Analyzes code and returns FileData
 * @param {string} code - The source code
 * @param {string} filepath - The file path
 * @returns {Promise<FileData>} Promisified FileData
 */
export declare function analyzeFile(code: string, filepath: string): Promise<FileData>;
