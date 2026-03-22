import { test, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { testExists } from './test_target.ts';

test('mock fs.existsSync in target', () => {
    mock.method(fs, 'existsSync', () => true);
    assert.strictEqual(testExists('any'), true);
    mock.method(fs, 'existsSync', () => false);
    assert.strictEqual(testExists('any'), false);
});
