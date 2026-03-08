import { FileData } from './types.js';
/**
 * Analyzes code and returns FileData
 * @param {string} code - The source code
 * @param {string} filepath - The file path
 * @returns {Promise<FileData>} Promisified FileData
 */
export declare function analyzeFile(code: string, filepath: string): Promise<FileData>;
