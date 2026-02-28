import glob from 'fast-glob';

/**
 * [ALFRED]: "The crawler is calibrated to ignore the Python Paradox, sir. 
 * We now observe the polyglot landscape, including documentation and workflows, 
 * while maintaining a strict perimeter around our own telemetry."
 */
export async function crawlRepository(targetPath: string): Promise<string[]> {
    const ignore = [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**',
        '**/.venv/**',
        '**/__pycache__/**',
        '**/.tox/**',
        '**/.pytest_cache/**',
        '**/.ruff_cache/**',
        '**/.stats/**',
        '**/.quarto/**',
        '**/.agent/vault/**',
        '**/*.stats.qmd',
    ];

    const patterns = [
        `${targetPath.replace(/\\/g, '/')}/**/*.{js,ts,jsx,tsx,py,md,qmd}`,
    ];

    return glob(patterns, {
        ignore,
        absolute: true,
    });
}
