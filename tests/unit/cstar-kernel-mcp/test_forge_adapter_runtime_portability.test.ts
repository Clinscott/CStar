import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    resolveBubblewrapRuntimePath,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_adapter_runtime.js';

describe('Forge adapter runtime portability', () => {
    it('resolves only the ordered trusted absolute Bubblewrap candidates', () => {
        const observed: string[] = [];
        const resolved = resolveBubblewrapRuntimePath((candidate) => {
            observed.push(candidate);
            return candidate === '/bin/bwrap';
        });

        assert.equal(resolved, '/bin/bwrap');
        assert.deepEqual(observed, ['/usr/bin/bwrap', '/bin/bwrap']);
        assert.equal(observed.some((candidate) => !candidate.startsWith('/')), false);
    });

    it('uses a stable fail-closed classification when Bubblewrap is absent', () => {
        assert.throws(
            () => resolveBubblewrapRuntimePath(() => false),
            (error: unknown) => {
                assert.equal((error as Error).message, 'forge_containment_runtime_missing');
                return true;
            },
        );
    });
});
