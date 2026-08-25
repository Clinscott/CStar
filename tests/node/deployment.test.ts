import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    deployCandidate,
    RETIRED_NODE_DEPLOYMENT_ERROR,
} from '../../src/node/deployment.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('retired legacy Node deployment helper', () => {
    it('fails before overwrite, Git, logging, or injected callback activity', async () => {
        const execFunction = mock.fn(() => {
            throw new Error('must not execute');
        });
        const log = mock.method(console, 'log', () => {
            throw new Error('must not log');
        });
        try {
            await assert.rejects(
                deployCandidate('/target.txt', '/candidate.txt', 'auto commit', execFunction),
                new RegExp(RETIRED_NODE_DEPLOYMENT_ERROR),
            );
            assert.equal(execFunction.mock.callCount(), 0);
            assert.equal(log.mock.callCount(), 0);
        } finally {
            log.mock.restore();
        }
    });

    it('contains no filesystem, process, Git, or console implementation', () => {
        const source = fs.readFileSync(path.join(PROJECT_ROOT, 'src', 'node', 'deployment.ts'), 'utf-8');
        assert.doesNotMatch(source, /node:fs|execa|child_process|git['"]|\.rename\s*\(|console\./i);
    });
});
