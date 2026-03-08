import fs from 'node:fs/promises';
import path from 'node:path';
import { updateChronicleIndex } from './database.js';
import { registry } from '../pathRegistry.js';
import chalk from 'chalk';

/**
 * Chronicle Indexer
 * Purpose: Transform historical records (Dev Journal, Memory) into searchable lore.
 * Mandate: The Wisdom of Mimir
 */
export class ChronicleIndexer {
    private files: string[];

    constructor() {
        const root = registry.getRoot();
        this.files = [
            path.join(root, 'dev_journal.qmd'),
            path.join(root, 'memory.qmd')
        ];
    }

    /**
     * Parse and index all registered chronicles.
     */
    public async index(): Promise<void> {
        console.error(chalk.cyan("[ALFRED] Ingesting historical chronicles into Mimir's Well..."));

        for (const file of this.files) {
            try {
                const stats = await fs.stat(file);
                if (!stats.isFile()) continue;

                const content = await fs.readFile(file, 'utf-8');
                await this.processFile(file, content);
            } catch (e) {
                // Skip if file doesn't exist
            }
        }
    }

    /**
     * Split a chronicle into semantic chunks and index them.
     */
    private async processFile(filePath: string, content: string): Promise<void> {
        const relPath = registry.getRelative(filePath);
        
        // Strategy: Split by Date Headers (## YYYY-MM-DD)
        const sections = content.split(/\n## /);
        
        for (const section of sections) {
            const lines = section.split('\n');
            const header = lines[0].trim();
            const body = lines.slice(1).join('\n').trim();

            if (!header || !body) continue;

            // Extract timestamp if possible (heuristic)
            const dateMatch = header.match(/(\d{4}-\d{2}-\d{2})/);
            const timestamp = dateMatch ? dateMatch[1] : '';

            updateChronicleIndex(relPath, header, body, timestamp);
        }
    }
}

