import { crawlRepository } from './crawler.js';
import { analyzeFile, FileData } from './analyzer.js';
import { writeReport } from './intel/writer.js';
import { compileMatrix } from './intel/compiler.js';
import { defaultProvider } from './intel/llm.js';
import fs from 'fs/promises';

/**
 * Main Execution Entry Point (Operation PennyOne)
 */
export async function runScan(targetPath: string): Promise<FileData[]> {
    const files = await crawlRepository(targetPath);
    const results: FileData[] = [];

    for (const file of files) {
        try {
            const code = await fs.readFile(file, 'utf-8');
            const data = await analyzeFile(code, file);

            // Phase 2: Intelligence Generation
            await writeReport(data, targetPath);

            results.push(data);
        } catch (error) {
            console.warn(`[WARNING] Failed to analyze ${file}:`, error);
        }
    }

    // Phase 2: Matrix Compilation
    if (results.length > 0) {
        await compileMatrix(results, targetPath);
    }

    return results;
}
