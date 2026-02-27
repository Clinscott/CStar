import path from 'path';

/**
 * Operation PennyOne: Centralized Path Registry
 * Purpose: Eliminate path hallucination and ensure consistent normalization across the codebase.
 */
export class PathRegistry {
    private static instance: PathRegistry;
    private root: string;

    private constructor() {
        this.root = process.cwd().replace(/\\/g, '/');
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
