import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';


const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');


test('retired PennyOne proxy source has no server, token, dispatch, or persistence primitives', () => {
    const source = fs.readFileSync(
        path.join(PROJECT_ROOT, 'src/tools/pennyone/vis/proxy.ts'),
        'utf8',
    );
    for (const forbidden of [
        "from 'fastify'",
        "from 'ws'",
        "from 'node:fs'",
        "from 'node:crypto'",
        "import('execa')",
        '.listen(',
        '.writeFileSync(',
        '.watch(',
        'handleArchitectMove(',
        'savePing(',
        'saveTrace(',
    ]) {
        assert.doesNotMatch(source, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});
