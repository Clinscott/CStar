import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('package installation has no automatic setup lifecycle', () => {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
    ) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};

    for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
        assert.equal(scripts[lifecycle], undefined, `${lifecycle} must remain operator-gated`);
    }
    assert.match(scripts['setup:local-explicit'] ?? '', /src\/node\/setup\.ts/);
});
