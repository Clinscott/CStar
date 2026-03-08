 
import path from 'path';

import fs from 'fs';

/**
 * Operation PennyOne: Centralized Path Registry
 * Purpose: Eliminate path hallucination and ensure consistent normalization across the codebase.
 */
export class PathRegistry {
    private static instance: PathRegistry;
    private root: string;

    private constructor() {
        this.root = this.findProjectRoot();
    }

    /**
     * Ascend the directory tree using ESM import.meta.dirname to locate the true project root.
     * Guaranteed to only run once per instantiation (The Ascension Cache).
     */
    private findProjectRoot(): string {
        try {
            let currentDir = import.meta.dirname;
            if (process.platform === 'win32' && currentDir.startsWith('/')) {
                currentDir = currentDir.slice(1);
            }

            let previousDir = '';

            while (currentDir !== previousDir) {
                const packageJsonPath = path.join(currentDir, 'package.json');
                const agentConfigPath = path.join(currentDir, '.agents', 'config.json');

                if (fs.existsSync(packageJsonPath) || fs.existsSync(agentConfigPath)) {
                    return currentDir.replace(/\\/g, '/');
                }

                previousDir = currentDir;
                currentDir = path.dirname(currentDir);
            }
        } catch {
            // Suppress and fallback
        }

        console.warn('[WARNING] PathRegistry could not determine true project root via ascension. Falling back to process.cwd().');
        return process.cwd().replace(/\\/g, '/');
    }

    /**
     * Retrieves the cached, mathematically proven project root.
     * @returns {string} The root path
     */
    public getRoot(): string {
        return this.root;
    }

    /**
     * Explicitly sets the project root. Primarily used for test isolation.
     * @param {string} newRoot - The new root path
     */
    public setRoot(newRoot: string): void {
        this.root = path.resolve(newRoot).replace(/\\/g, '/');
    }

    /**
     * Get the singleton instance.
     * @returns {PathRegistry} The instance
     */
    public static getInstance(): PathRegistry {
        if (!PathRegistry.instance) {
            PathRegistry.instance = new PathRegistry();
        }
        return PathRegistry.instance;
    }

    /**
     * Standardize a path to forward-slash absolute format.
     * @param {string} p - The path
     * @returns {string} Normalized path
     */
    public normalize(p: string): string {
        if (!p) return '';
        const normalized = p.replace(/\\/g, '/');
        if (path.isAbsolute(normalized)) {
            return normalized;
        }
        return path.join(this.root, normalized).replace(/\\/g, '/');
    }

    /**
     * Resolve a relative path from a source file.
     * @param {string} sourceFile - Source file
     * @param {string} relativePath - Relative path
     * @returns {string} Resolved path
     */
    public resolve(sourceFile: string, relativePath: string): string {
        const dir = path.dirname(sourceFile);
        return this.normalize(path.resolve(dir, relativePath));
    }

    /**
     * Get the relative path from the project root.
     * @param {string} p - The absolute path
     * @returns {string} Relative path
     */
    public getRelative(p: string): string {
        const abs = this.normalize(p);
        return path.relative(this.root, abs).replace(/\\/g, '/');
    }
}

export const registry = PathRegistry.getInstance();

