/* eslint-disable jsdoc/require-param-description */
import path from 'path';
import fs from 'fs';
/**
 * Operation PennyOne: Centralized Path Registry
 * Purpose: Eliminate path hallucination and ensure consistent normalization across the codebase.
 */
export class PathRegistry {
    static instance;
    root;
    constructor() {
        this.root = this.findProjectRoot();
    }
    /**
     * Ascend the directory tree using ESM import.meta.dirname to locate the true project root.
     * Guaranteed to only run once per instantiation (The Ascension Cache).
     */
    findProjectRoot() {
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
        }
        catch {
            // Suppress and fallback
        }
        console.warn('[WARNING] PathRegistry could not determine true project root via ascension. Falling back to process.cwd().');
        return process.cwd().replace(/\\/g, '/');
    }
    /**
     * Retrieves the cached, mathematically proven project root.
     * @returns {string} The root path
     */
    getRoot() {
        return this.root;
    }
    /**
     * Get the singleton instance.
     * @returns {PathRegistry} The instance
     */
    static getInstance() {
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
    normalize(p) {
        if (!p)
            return '';
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
    resolve(sourceFile, relativePath) {
        const dir = path.dirname(sourceFile);
        return this.normalize(path.resolve(dir, relativePath));
    }
    /**
     * Get the relative path from the project root.
     * @param {string} p - The absolute path
     * @returns {string} Relative path
     */
    getRelative(p) {
        const abs = this.normalize(p);
        return path.relative(this.root, abs).replace(/\\/g, '/');
    }
}
export const registry = PathRegistry.getInstance();
