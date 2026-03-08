import { FileData } from './analyzer.js';
/**
 * Targeted Incremental Scan (The Sector Strike)
 * Purpose: Re-analyze a single file and update the global matrix.
 * @param {string} filePath - Path to the file to re-index
 * @returns {Promise<FileData | null>} The analyzed data
 */
export declare function indexSector(filePath: string): Promise<FileData | null>;
/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @param {boolean} force - Force re-analysis of all files
 * @returns {Promise<FileData[]>} Scanned files
 */
export declare function runScan(targetPath: string, force?: boolean): Promise<FileData[]>;
