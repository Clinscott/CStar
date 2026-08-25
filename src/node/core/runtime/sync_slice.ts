import path from 'node:path';
import { fileURLToPath } from 'node:url';


export const RETIRED_SYNC_SLICE_ERROR =
    'legacy_sync_slice_retired_use_cstar_forge';

export const deps = Object.freeze({ executionEnabled: false as const });


export async function runSyncSlice(workspaceRoot: string, beadId: string): Promise<never> {
    void workspaceRoot;
    void beadId;
    throw new Error(RETIRED_SYNC_SLICE_ERROR);
}


export function main(stderr = process.stderr): number {
    stderr.write(`${RETIRED_SYNC_SLICE_ERROR}\n`);
    return 1;
}


const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
