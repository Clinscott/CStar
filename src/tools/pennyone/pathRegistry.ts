 
import path from 'path';

import fs from 'fs';

function isAbsolutePath(input: string): boolean {
    return path.isAbsolute(input) || path.win32.isAbsolute(input) || path.posix.isAbsolute(input);
}

function normalizeSeparators(input: string): string {
    return input.replace(/\\/g, '/');
}

function usesWindowsPathApi(input: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(input) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+/.test(input);
}

function resolveWithBase(base: string, ...segments: string[]): string {
    if (process.platform === 'win32') {
        return usesWindowsPathApi(base) ? path.win32.resolve(base, ...segments) : path.resolve(base, ...segments);
    }
    return path.posix.resolve(base, ...segments);
}

function joinWithBase(base: string, ...segments: string[]): string {
    if (process.platform === 'win32') {
        return usesWindowsPathApi(base) ? path.win32.join(base, ...segments) : path.join(base, ...segments);
    }
    return path.posix.join(base, ...segments);
}

function dirnameForPath(input: string): string {
    if (process.platform === 'win32') {
        return usesWindowsPathApi(input) ? path.win32.dirname(input) : path.dirname(input);
    }
    return path.posix.dirname(input);
}

function relativeBetween(from: string, to: string): string {
    if (process.platform === 'win32') {
        return usesWindowsPathApi(from) || usesWindowsPathApi(to)
            ? path.win32.relative(from, to)
            : path.relative(from, to);
    }
    return path.posix.relative(from, to);
}

/**
 * Operation PennyOne: Centralized Path Registry
 * Purpose: Eliminate path hallucination and ensure consistent normalization across the codebase.
 */
export class PathRegistry {
    private static instance: PathRegistry;
    private root: string;

    private constructor() {
        this.root = this.findProjectRoot(process.env.CSTAR_PROJECT_ROOT || process.env.CSTAR_WORKSPACE_ROOT || process.env.CSTAR_LAUNCH_CWD);
    }

    /**
     * Ascend the directory tree using ESM import.meta.dirname to locate the true project root.
     * Guaranteed to only run once per instantiation (The Ascension Cache).
     */
    private findProjectRoot(startPath?: string): string {
        try {
            let currentDir = startPath
                ? (isAbsolutePath(startPath) ? normalizeSeparators(startPath) : path.resolve(startPath))
                : import.meta.dirname;
            
            // [🔱] THE ONE MIND: Cross-platform Sanitization
            if (process.platform !== 'win32' && /^[A-Za-z]:/.test(currentDir)) {
                // If we are on Linux but got a Windows path (hallucination or stale context),
                // we must ignore it and fallback to the actual current directory.
                currentDir = process.cwd();
            }

            if (process.platform === 'win32' && currentDir.startsWith('/')) {
                currentDir = currentDir.slice(1);
            }

            if (fs.existsSync(currentDir) && !fs.statSync(currentDir).isDirectory()) {
                currentDir = dirnameForPath(currentDir);
            }

            let previousDir = '';

            while (currentDir !== previousDir) {
                const packageJsonPath = path.join(currentDir, 'package.json');
                const agentConfigPath = path.join(currentDir, '.agents', 'config.json');

                if (fs.existsSync(packageJsonPath) || fs.existsSync(agentConfigPath)) {
                    return currentDir.replace(/\\/g, '/');
                }

                previousDir = currentDir;
                currentDir = dirnameForPath(currentDir);
            }
        } catch {
            // Suppress and fallback
        }

        const fallback = startPath ? path.resolve(startPath) : process.cwd();
        const normalizedFallback = fs.existsSync(fallback) && fs.statSync(fallback).isDirectory()
            ? fallback
            : dirnameForPath(fallback);
        console.warn('[WARNING] PathRegistry could not determine true project root via ascension. Falling back to the requested workspace path.');
        return normalizedFallback.replace(/\\/g, '/');
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
        const resolvedRoot = isAbsolutePath(newRoot)
            ? normalizeSeparators(newRoot)
            : path.resolve(newRoot).replace(/\\/g, '/');
        console.log(`[DEBUG] PathRegistry.setRoot: ${resolvedRoot}`);
        this.root = resolvedRoot;
    }

    public detectWorkspaceRoot(startPath: string): string {
        return this.findProjectRoot(startPath);
    }

    public isSpokeUri(targetPath: string): boolean {
        return /^spoke:\/\/[A-Za-z0-9._-]+(?:\/.*)?$/i.test(targetPath.trim());
    }

    public parseSpokeUri(targetPath: string): { slug: string; relativePath: string } {
        const match = targetPath.trim().match(/^spoke:\/\/([A-Za-z0-9._-]+)(?:\/(.*))?$/i);
        if (!match) {
            throw new Error(`Invalid spoke URI '${targetPath}'. Expected spoke://<slug>/path`);
        }

        return {
            slug: match[1].toLowerCase(),
            relativePath: (match[2] ?? '').replace(/^\/+/, ''),
        };
    }

    public resolveSpokeUri(targetPath: string, spokeRoot: string): string {
        const normalizedRoot = this.normalize(spokeRoot);
        const { relativePath } = this.parseSpokeUri(targetPath);
        const candidate = relativePath
            ? resolveWithBase(normalizedRoot, relativePath).replace(/\\/g, '/')
            : normalizedRoot;
        const rootPrefix = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;

        if (candidate !== normalizedRoot && !candidate.startsWith(rootPrefix)) {
            throw new Error(`Traversal outside mounted spoke root is not allowed for '${targetPath}'.`);
        }

        return candidate;
    }

    public resolveEstatePath(
        targetPath: string,
        mountedSpokes: Array<{ slug: string; root_path: string }> = [],
    ): string {
        if (!this.isSpokeUri(targetPath)) {
            return this.normalize(targetPath);
        }

        const { slug } = this.parseSpokeUri(targetPath);
        const spoke = mountedSpokes.find((entry) => entry.slug.toLowerCase() === slug);
        if (!spoke) {
            throw new Error(`Mounted spoke '${slug}' is not registered in the Hall estate.`);
        }

        return this.resolveSpokeUri(targetPath, spoke.root_path);
    }

    /**
     * Get the singleton instance.
     * @returns {PathRegistry} The instance
     */
    public static getInstance(): PathRegistry {
        const globalAny = globalThis as any;
        if (!globalAny.__PATH_REGISTRY_INSTANCE__) {
            globalAny.__PATH_REGISTRY_INSTANCE__ = new PathRegistry();
        }
        return globalAny.__PATH_REGISTRY_INSTANCE__;
    }

    /**
     * Standardize a path to forward-slash absolute format.
     * @param {string} p - The path
     * @returns {string} Normalized path
     */
    public normalize(p: string): string {
        if (!p) return '';
        const normalized = normalizeSeparators(p);
        if (isAbsolutePath(p) || isAbsolutePath(normalized)) {
            return normalized;
        }
        return joinWithBase(this.root, normalized).replace(/\\/g, '/');
    }

    /**
     * Resolve a relative path from a source file.
     * @param {string} sourceFile - Source file
     * @param {string} relativePath - Relative path
     * @returns {string} Resolved path
     */
    public resolve(sourceFile: string, relativePath: string): string {
        const dir = dirnameForPath(sourceFile);
        return this.normalize(resolveWithBase(dir, relativePath));
    }

    /**
     * Get the relative path from the project root.
     * @param {string} p - The absolute path
     * @returns {string} Relative path
     */
    public getRelative(p: string): string {
        const abs = this.normalize(p);
        return relativeBetween(this.root, abs).replace(/\\/g, '/');
    }
}

export const registry = PathRegistry.getInstance();

