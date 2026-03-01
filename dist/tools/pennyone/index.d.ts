import { FileData } from './analyzer';
/**
 * Main Execution Entry Point (Operation PennyOne)
 * @param {string} targetPath - Target path
 * @returns {Promise<FileData[]>} Scanned files
 */
export declare function runScan(targetPath: string): Promise<FileData[]>;
