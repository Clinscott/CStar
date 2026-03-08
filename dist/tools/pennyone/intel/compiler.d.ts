import { FileData } from '../types.js';
/**
 * Matrix Compiler
 * Purpose: Compile all FileData into a master JSON graph with resolved dependencies.
 * @param {FileData[]} results - The analysis results
 * @param {string} targetRepo - The target repository path
 * @returns {Promise<string>} Path to the generated graph
 */
export declare function compileMatrix(results: FileData[], targetRepo: string): Promise<string>;
