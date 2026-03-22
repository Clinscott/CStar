import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_KERNEL_ROOT } from  '../../../src/node/core/runtime/kernel_root.js';
import path from 'node:path';

describe('Kernel Root Unit Tests', () => {
    it('should export a valid project root path', () => {
        assert.ok(typeof RUNTIME_KERNEL_ROOT === 'string');
        assert.ok(path.isAbsolute(RUNTIME_KERNEL_ROOT));
        // Expecting it to point to something that looks like the root directory (has src or package.json)
        // This is a bit weak but better than nothing
        assert.ok(RUNTIME_KERNEL_ROOT.length > 5);
    });
});
