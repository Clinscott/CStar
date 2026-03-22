import { test, mock } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';

test('mock fs.existsSync', () => {
    mock.method(fs, 'existsSync', () => true);
    assert.strictEqual(fs.existsSync('any'), true);
    mock.method(fs, 'existsSync', () => false);
    assert.strictEqual(fs.existsSync('any'), false);
});
