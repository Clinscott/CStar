import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import {
    loadCascadingContext,
    RETIRED_CASCADING_CONTEXT_LOADER_ERROR,
} from '../../src/core/context_loader.js';

describe('retired cascading context loader', () => {
    it('fails before project, parent, home, or instruction-file reads', () => {
        assert.throws(
            () => loadCascadingContext('/tmp/should-not-be-read'),
            new RegExp(RETIRED_CASCADING_CONTEXT_LOADER_ERROR),
        );
        const source = fs.readFileSync(
            new URL('../../src/core/context_loader.ts', import.meta.url),
            'utf8',
        );
        for (const forbidden of [
            'node:fs',
            'node:os',
            'readFile',
            'homedir',
            '.corvus',
            'AGENTS.md',
        ]) {
            assert.equal(source.includes(forbidden), false, `context loader retained ${forbidden}`);
        }
    });
});
