import { execa } from 'execa';
import path from 'node:path';
import * as fsSync from 'node:fs';

const ALLOWED_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.md', '.qmd']);
const BLOAT_PATTERNS = [
    `${path.sep}tmp_`,
    `${path.sep}temp_`,
    'node_modules',
    '.agents' + path.sep + 'temp_hunt',
    '.agents' + path.sep + 'vault',
    '.agents' + path.sep + 'traces',
    '.agents' + path.sep + 'memory',
    'tests' + path.sep + 'gauntlet',
    '.stats',
    '.quarto',
    '__pycache__',
    '.git',
    '.pytest_cache',
    '.ruff_cache',
    'dist',
    'build',
    'skills_db',
];

function shouldIncludeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) return false;
    return !BLOAT_PATTERNS.some((pattern) => filePath.includes(pattern));
}

function collectFilesFromFilesystem(scanRoot: string, maxFiles: number): string[] {
    const results: string[] = [];
    const queue = [scanRoot];

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) continue;

        let entries: fsSync.Dirent[];
        try {
            entries = fsSync.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const entryPath = path.join(current, entry.name);
            if (BLOAT_PATTERNS.some((pattern) => entryPath.includes(pattern))) {
                continue;
            }

            if (entry.isDirectory()) {
                queue.push(entryPath);
                continue;
            }

            if (entry.isFile() && shouldIncludeFile(entryPath)) {
                results.push(entryPath);
                if (results.length >= maxFiles) return results;
            }
        }
    }

    return results;
}

/**
 * [ALFRED]: "The crawler is now calibrated for high-fidelity intelligence, sir.
 * We prioritize the Neural Matrix: Core Source, Mechanical Tools, and Validating Tests.
 * We surgically excise the 'Ephemeral Bloat'—transient memory, caches, and side-effects."
 * @param {string} targetPath - Path to crawl
 * @returns {Promise<string[]>} File paths
 */
export async function crawlRepository(
    targetPath: string,
    maxFiles = Number.MAX_SAFE_INTEGER,
): Promise<string[]> {
    const absoluteTarget = path.resolve(targetPath);
    if (fsSync.existsSync(absoluteTarget) && fsSync.statSync(absoluteTarget).isFile()) {
        return shouldIncludeFile(absoluteTarget) ? [absoluteTarget] : [];
    }
    const scanRoot = absoluteTarget;

    try {
        const { stdout } = await execa('git', [
            'ls-files',
            '--cached',
            '--others',
            '--exclude-standard',
            '.',
        ], {
            cwd: scanRoot,
            maxBuffer: 4 * 1024 * 1024,
        });

        const files: string[] = [];
        for (const rawFile of stdout.split('\n')) {
            const relativeFile = rawFile.trim();
            if (!relativeFile) continue;
            const absoluteFile = path.resolve(scanRoot, relativeFile);
            if (!fsSync.existsSync(absoluteFile) || !shouldIncludeFile(absoluteFile)) continue;
            files.push(absoluteFile);
            if (files.length >= maxFiles) break;
        }

        return files;
    } catch (error) {
        console.warn('[ALFRED]: "Git integration failed. Falling back to filesystem crawl."');
        return collectFilesFromFilesystem(scanRoot, maxFiles);
    }
}
