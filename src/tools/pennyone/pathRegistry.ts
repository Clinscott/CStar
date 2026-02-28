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
                const agentConfigPath = path.join(currentDir, '.agent', 'config.json');

                if (fs.existsSync(packageJsonPath) || fs.existsSync(agentConfigPath)) {
                    return currentDir.replace(/\\/g, '/');
                }

                previousDir = currentDir;
                currentDir = path.dirname(currentDir);
            }
        } catch (error) {
            // Suppress and fallback
        }

        console.warn('[WARNING] PathRegistry could not determine true project root via ascension. Falling back to process.cwd().');
        return process.cwd().replace(/\\/g, '/');
    }

    /**
     * Retrieves the cached, mathematically proven project root.
     */
    public getRoot(): string {
        return this.root;
    }

    public static getInstance(): PathRegistry {
        if (!PathRegistry.instance) {
            PathRegistry.instance = new PathRegistry();
        }
        return PathRegistry.instance;
    }

    /**
     * Standardize a path to forward-slash absolute format.
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
     */
    public resolve(sourceFile: string, relativePath: string): string {
        const dir = path.dirname(sourceFile);
        return this.normalize(path.resolve(dir, relativePath));
    }

    /**
     * Get the relative path from the project root.
     */
    public getRelative(p: string): string {
        const abs = this.normalize(p);
        return path.relative(this.root, abs).replace(/\\/g, '/');
    }
}

export const registry = PathRegistry.getInstance();
