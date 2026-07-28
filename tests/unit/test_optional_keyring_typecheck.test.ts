import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const secretsSource = new URL('../../src/tools/pennyone/secrets.ts', import.meta.url);

test('optional keyring import stays runtime-resolved and fail-closed', async () => {
    const source = await readFile(secretsSource, 'utf8');

    assert.match(source, /const keyringPackage: string = '@napi-rs\/keyring';/);
    assert.match(source, /await import\(keyringPackage\)\.catch/);
    assert.doesNotMatch(source, /import\('@napi-rs\/keyring'\)/);
    assert.match(source, /@napi-rs\/keyring not installed\./);
});
