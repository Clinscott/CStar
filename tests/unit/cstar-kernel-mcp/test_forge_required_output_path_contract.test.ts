import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import {
    assertForgeRequiredOutputsContained,
    canonicalizeForgeRequiredOutputPaths,
} from '../../../src/tools/cstar-kernel-mcp/tools/forge_request_contract.js';

describe('Forge required-output path contract', () => {
    it('keeps safe spelling exact while canonicalizing authority', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-paths-'));
        const actual = canonicalizeForgeRequiredOutputPaths(root, [
            'with space,comma.py',
            'literal%2e%2e.py',
            'literal\\backslash.py',
        ]);
        assert.deepEqual(actual, [
            path.join(root, 'literal%2e%2e.py'),
            path.join(root, 'literal\\backslash.py'),
            path.join(root, 'with space,comma.py'),
        ].sort());
    });

    for (const [name, value, code] of [
        ['surrounding whitespace', ' output.py', 'forge_required_output_path_surrounding_whitespace'],
        ['newline', 'bad\nname.py', 'forge_required_output_path_unsafe_text'],
        ['escape', 'bad\u001bname.py', 'forge_required_output_path_unsafe_text'],
        ['bidi override', 'bad\u202ename.py', 'forge_required_output_path_unsafe_text'],
        ['zero width', 'bad\u200bname.py', 'forge_required_output_path_unsafe_text'],
        ['dot segment', './output.py', 'forge_required_output_path_alias_forbidden'],
        ['parent segment', 'dir/../output.py', 'forge_required_output_path_alias_forbidden'],
        ['trailing separator', 'output.py/', 'forge_required_output_path_alias_forbidden'],
    ] as const) {
        it(`rejects ${name} with a value-free code`, () => {
            const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-reject-'));
            assert.throws(
                () => canonicalizeForgeRequiredOutputPaths(root, [value]),
                (error: unknown) => error instanceof Error
                    && error.message === code
                    && !error.message.includes(value),
            );
        });
    }

    it('rejects exact and canonical duplicates instead of deduplicating them', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-duplicate-'));
        const absolute = path.join(root, 'same.py');
        assert.throws(
            () => canonicalizeForgeRequiredOutputPaths(root, ['same.py', absolute]),
            /forge_required_output_duplicate_canonical_path/,
        );
        assert.throws(
            () => canonicalizeForgeRequiredOutputPaths(root, [absolute, absolute]),
            /forge_required_output_duplicate_canonical_path/,
        );
    });

    it('does not case-fold or Unicode-normalize Linux filenames', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-exactness-'));
        const values = ['A.py', 'a.py', 'caf\u00e9.py', 'cafe\u0301.py'];
        const canonical = canonicalizeForgeRequiredOutputPaths(root, values);
        assert.equal(new Set(canonical).size, values.length);
    });

    it('fails outside-target containment without echoing the path', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-containment-'));
        const target = path.join(root, 'inside.py');
        const outside = `${root}-sibling/OUTSIDE_PATH_CANARY.py`;
        assert.throws(
            () => assertForgeRequiredOutputsContained(root, [target], [outside]),
            (error: unknown) => error instanceof Error
                && error.message === 'forge_required_output_outside_targets'
                && !error.message.includes('OUTSIDE_PATH_CANARY'),
        );
    });

    it('rejects existing regular target and output hardlinks', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-required-hardlinks-'));
        try {
            const target = path.join(root, 'target.ts');
            const targetSource = path.join(root, 'target-source.ts');
            fs.writeFileSync(targetSource, 'target\n');
            fs.linkSync(targetSource, target);
            assert.throws(
                () => assertForgeRequiredOutputsContained(root, [target], [target]),
                /forge_target_path_hardlink_forbidden/,
            );

            const targetDirectory = path.join(root, 'target-dir');
            const output = path.join(targetDirectory, 'output.txt');
            const outputSource = path.join(root, 'output-source.txt');
            fs.mkdirSync(targetDirectory);
            fs.writeFileSync(outputSource, 'output\n');
            fs.linkSync(outputSource, output);
            assert.throws(
                () => assertForgeRequiredOutputsContained(root, [targetDirectory], [output]),
                /forge_required_output_path_hardlink_forbidden/,
            );
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
