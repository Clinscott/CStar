import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AUTOMATION_DIRS = [
    path.join(ROOT, '.github', 'commands'),
    path.join(ROOT, '.github', 'workflows'),
];

function trackedAutomationNames(): string[] {
    return AUTOMATION_DIRS.flatMap((directory) => (
        fs.existsSync(directory)
            ? fs.readdirSync(directory).map((name) => path.relative(ROOT, path.join(directory, name)))
            : []
    ));
}

describe('Gemini retirement invariant', () => {
    it('keeps retired Gemini commands and workflows absent', () => {
        const legacyAutomation = trackedAutomationNames()
            .filter((name) => /(^|\/)gemini[^/]*\.(toml|ya?ml)$/i.test(name))
            .sort();

        assert.deepEqual(legacyAutomation, []);
    });
});
