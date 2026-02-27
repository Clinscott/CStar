import glob from 'fast-glob';

/**
 * [ALFRED]: "The crawler is calibrated to ignore the Python Paradox, sir. 
 * It shall only observe the JS/TS/JSX/TSX neural pathways."
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
    ];

    const patterns = [
        `${targetPath.replace(/\\/g, '/')}/**/*.{js,ts,jsx,tsx,py}`,
    ];

    return glob(patterns, {
        ignore,
        absolute: true,
    });
}
