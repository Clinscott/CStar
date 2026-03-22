import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { registry } from  '../../src/tools/pennyone/pathRegistry.js';

describe('Estate path registry (CS-P7-04)', () => {
    it('resolves spoke URIs through explicit mounted spoke roots', () => {
        const resolved = registry.resolveEstatePath('spoke://keepos/src/main.ts', [
            {
                slug: 'keepos',
                root_path: 'C:/Estate/KeepOS',
            },
        ]);

        assert.equal(resolved, 'C:/Estate/KeepOS/src/main.ts');
    });

    it('rejects traversal outside the mounted spoke root', () => {
        assert.throws(
            () => registry.resolveEstatePath('spoke://keepos/../../secrets.txt', [
                {
                    slug: 'keepos',
                    root_path: 'C:/Estate/KeepOS',
                },
            ]),
            /outside mounted spoke root/i,
        );
    });

    it('returns a structured failure for unknown spokes', () => {
        assert.throws(
            () => registry.resolveEstatePath('spoke://missing/src/main.ts', [
                {
                    slug: 'keepos',
                    root_path: 'C:/Estate/KeepOS',
                },
            ]),
            /not registered in the Hall estate/i,
        );
    });
});
