import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RETIRED_SETUP_ERROR =
    'direct_local_setup_retired_requires_operator_gated_supported_installer';

/** Pure compatibility helper; it performs no discovery or installation. */
export function getVenvBinaryPath(
    platform: string,
    projectRoot: string,
    binaryName: string,
): string {
    if (platform === 'win32') {
        const binary = binaryName === 'python' ? 'python.exe' : `${binaryName}.exe`;
        return path.join(projectRoot, '.venv', 'Scripts', binary);
    }
    return path.join(projectRoot, '.venv', 'bin', binaryName);
}

/** @deprecated Setup may not create environments, install packages, or link globally. */
export async function executeGenesisSequence(
    _platform: string = process.platform,
    _execFunction?: unknown,
    _fsAdapter?: unknown,
): Promise<never> {
    throw new Error(RETIRED_SETUP_ERROR);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    executeGenesisSequence().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : RETIRED_SETUP_ERROR;
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
    });
}
