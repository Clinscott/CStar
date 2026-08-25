import { after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ownedRoots = new Set<string>();

export function createOwnedSyntheticSpokeRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    ownedRoots.add(root);
    return root;
}

after(() => {
    for (const root of ownedRoots) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    ownedRoots.clear();
});
