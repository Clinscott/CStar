import { execa } from 'execa';
import path from 'node:path';
import * as fsSync from 'node:fs';

/**
 * [ALFRED]: "The crawler is now calibrated for high-fidelity intelligence, sir.
 * We prioritize the Neural Matrix: Core Source, Mechanical Tools, and Validating Tests.
 * We surgically excise the 'Ephemeral Bloat'—transient memory, caches, and side-effects."
 * @param {string} targetPath - Path to crawl
 * @returns {Promise<string[]>} File paths
 */
export async function crawlRepository(targetPath: string): Promise<string[]> {
    const allowedExtensions = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.md', '.qmd']);

    // Patterns that signify transient/bloat data
    const bloatPatterns = [
        `${path.sep}tmp_`,
        `${path.sep}temp_`,
        'node_modules',
        '.agent' + path.sep + 'temp_hunt',
        '.agent' + path.sep + 'vault',
        '.agent' + path.sep + 'traces',
        'tests' + path.sep + 'gauntlet',
        '.stats',
        '.quarto',
        '__pycache__',
        '.git'
    ];

    try {
        const { stdout } = await execa('git', [
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
            targetPath
        ]);

        const files = stdout.split('\n')
            .filter(f => f.trim() !== '')
            .map(f => f.trim())
            .map(f => path.resolve(process.cwd(), f))
            .filter(f => {
                // 1. Check Extension
                const ext = path.extname(f).toLowerCase();
                if (!allowedExtensions.has(ext)) return false;

                // 2. Check for bloat patterns
                const isBloat = bloatPatterns.some(p => f.includes(p));
                if (isBloat) return false;

                // 3. Verify physical existence (Git index might be stale)
                return fsSync.existsSync(f);
            });

        return files;
    } catch (error) {
        console.warn('[ALFRED]: "Git integration failed. Operation PennyOne standing down on crawl."');
        return [];
    }
}

