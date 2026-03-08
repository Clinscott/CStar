import { FileData } from '../types.js';
/**
 * QMD Writer
 * Purpose: Generate Quarto reports in a flattened .stats/ directory.
 * @param {FileData} file - The file data
 * @param {string} targetRepo - The target repository path
 * @param {string} code - The source code
 * @param {Object} [intentData] - Optional pre-generated intent and interaction
 * @returns {Promise<{ qmdPath: string, intent: string, interaction: string }>} Path, intent, and interaction
 */
export declare function writeReport(file: FileData, targetRepo: string, code: string, intentData?: {
    intent: string;
    interaction: string;
}): Promise<{
    qmdPath: string;
    intent: string;
    interaction: string;
}>;
