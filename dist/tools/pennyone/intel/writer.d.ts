import { FileData } from '../analyzer.js';
/**
 * QMD Writer
 * Purpose: Generate Quarto reports in a flattened .stats/ directory.
 * @param {FileData} file - The file data
 * @param {string} targetRepo - The target repository path
 * @param {string} code - The source code
 * @returns {Promise<{ qmdPath: string, intent: string }>} Path and intent
 */
export declare function writeReport(file: FileData, targetRepo: string, code: string): Promise<{
    qmdPath: string;
    intent: string;
}>;
