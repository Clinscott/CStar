import { FileData } from '../analyzer.js';
export interface GungnirMatrix {
    logic: number;
    style: number;
    intel: number;
    overall: number;
    gravity: number;
}
export interface CompiledGraph {
    version: string;
    scanned_at: string;
    files: Array<{
        path: string;
        loc: number;
        complexity: number;
        matrix: GungnirMatrix;
        intent: string;
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
/**
 * Matrix Compiler
 * Purpose: Compile all FileData into a master JSON graph with resolved dependencies.
 * @param {FileData[]} results - The analysis results
 * @param {string} targetRepo - The target repository path
 * @returns {Promise<string>} Path to the generated graph
 */
export declare function compileMatrix(results: FileData[], targetRepo: string): Promise<string>;
