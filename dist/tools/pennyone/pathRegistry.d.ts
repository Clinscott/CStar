/**
 * Operation PennyOne: Centralized Path Registry
 * Purpose: Eliminate path hallucination and ensure consistent normalization across the codebase.
 */
export declare class PathRegistry {
    private static instance;
    private root;
    private constructor();
    /**
     * Ascend the directory tree using ESM import.meta.dirname to locate the true project root.
     * Guaranteed to only run once per instantiation (The Ascension Cache).
     */
    private findProjectRoot;
    /**
     * Retrieves the cached, mathematically proven project root.
     * @returns {string} The root path
     */
    getRoot(): string;
    /**
     * Get the singleton instance.
     * @returns {PathRegistry} The instance
     */
    static getInstance(): PathRegistry;
    /**
     * Standardize a path to forward-slash absolute format.
     * @param {string} p - The path
     * @returns {string} Normalized path
     */
    normalize(p: string): string;
    /**
     * Resolve a relative path from a source file.
     * @param {string} sourceFile - Source file
     * @param {string} relativePath - Relative path
     * @returns {string} Resolved path
     */
    resolve(sourceFile: string, relativePath: string): string;
    /**
     * Get the relative path from the project root.
     * @param {string} p - The absolute path
     * @returns {string} Relative path
     */
    getRelative(p: string): string;
}
export declare const registry: PathRegistry;
