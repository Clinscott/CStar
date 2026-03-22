import * as fs from 'node:fs';
import * as path from 'node:path';
import { database } from  '../../../tools/pennyone/intel/database.js';
import { extractTargetSymbol, injectTargetSymbol } from  './ast_slicer.js';

// [ALFRED] Exported dependencies for 1:1 unit test isolation
export const deps = {
    fs: {
        existsSync: (path: string) => fs.existsSync(path),
        readFileSync: (path: string, encoding: 'utf-8') => fs.readFileSync(path, encoding)
    },
    database,
    astSlicer: { injectTargetSymbol }
};

export async function runSyncSlice(workspaceRoot: string, beadId: string) {
    if (!workspaceRoot || !beadId) {
        return;
    }

    const bead = deps.database.getHallBeads(workspaceRoot).find((b: any) => b.id === beadId);
    if (!bead) {
        return;
    }

    const payload = bead.critique_payload;
    if (!payload || typeof payload.target_symbol !== 'string' || !payload.target_symbol.trim()) {
        return;
    }

    const targetSymbol = payload.target_symbol.trim();
    const originalTargetPath = bead.target_path ?? bead.target_ref;
    if (!originalTargetPath) {
        return;
    }

    const sandboxDir = path.join(workspaceRoot, '.agents', 'tmp_sandbox');
    const slicedTempPath = path.join(sandboxDir, `${targetSymbol}_slice.ts`);

    if (deps.fs.existsSync(slicedTempPath)) {
        const modifiedCode = deps.fs.readFileSync(slicedTempPath, 'utf-8');
        // Inject the modified code back into the original file so tests can see it
        deps.astSlicer.injectTargetSymbol(workspaceRoot, originalTargetPath, targetSymbol, modifiedCode);
    }
}

// Execution entry point
if (process.argv[1] && process.argv[1].endsWith('sync_slice.ts')) {
    const workspaceRoot = process.argv[2];
    const beadId = process.argv[3];
    runSyncSlice(workspaceRoot, beadId).then(() => {
        process.exit(0);
    }).catch(() => {
        process.exit(1);
    });
}
