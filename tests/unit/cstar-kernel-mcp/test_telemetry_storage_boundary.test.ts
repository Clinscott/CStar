import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    appendBoundedTelemetryLine,
    readBoundedTelemetryFile,
} from '../../../src/tools/cstar-kernel-mcp/telemetry/storage.ts';

const roots: string[] = [];

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function fixture(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-telemetry-boundary-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, '.agents'));
    return root;
}

describe('MCP telemetry storage boundary', () => {
    it('keeps a bounded rolling JSONL segment', () => {
        const root = fixture();
        const filename = 'synthetic.jsonl';
        assert.equal(appendBoundedTelemetryLine(root, filename, '{"id":1}', 17), true);
        assert.equal(appendBoundedTelemetryLine(root, filename, '{"id":2}', 17), true);
        const content = fs.readFileSync(path.join(root, '.agents', 'state', filename), 'utf8');
        assert.equal(content, '{"id":2}\n');
        assert.ok(Buffer.byteLength(content) <= 17);
    });

    it('rejects oversized records and unsafe filenames without a write', () => {
        const root = fixture();
        assert.equal(appendBoundedTelemetryLine(root, 'synthetic.jsonl', 'x'.repeat(128), 64), false);
        assert.throws(
            () => appendBoundedTelemetryLine(root, '../outside.jsonl', '{}', 64),
            /telemetry_filename_invalid/,
        );
        assert.equal(fs.existsSync(path.join(root, '.agents', 'state', 'synthetic.jsonl')), false);
    });

    it('rejects symlinked state directories and hardlinked telemetry files', () => {
        const root = fixture();
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-telemetry-outside-'));
        roots.push(outside);
        fs.symlinkSync(outside, path.join(root, '.agents', 'state'));
        assert.throws(
            () => appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64),
            /telemetry_state_directory_unsafe/,
        );
        fs.unlinkSync(path.join(root, '.agents', 'state'));
        fs.mkdirSync(path.join(root, '.agents', 'state'));
        const outsideFile = path.join(outside, 'outside.jsonl');
        fs.writeFileSync(outsideFile, 'outside\n');
        fs.linkSync(outsideFile, path.join(root, '.agents', 'state', 'synthetic.jsonl'));
        assert.equal(appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64), false);
        assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'outside\n');
    });

    it('rejects group/world-writable storage for reads and writes', () => {
        const root = fixture();
        fs.chmodSync(root, 0o777);
        assert.throws(
            () => appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64),
            /telemetry_root_unsafe_permissions/,
        );
        fs.chmodSync(root, 0o700);

        fs.chmodSync(path.join(root, '.agents'), 0o777);
        assert.throws(
            () => appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64),
            /telemetry_agents_directory_unsafe_permissions/,
        );
        fs.chmodSync(path.join(root, '.agents'), 0o700);

        assert.equal(appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64), true);
        const state = path.join(root, '.agents', 'state');
        const target = path.join(state, 'synthetic.jsonl');
        fs.chmodSync(state, 0o777);
        assert.throws(
            () => appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64),
            /telemetry_state_directory_unsafe_permissions/,
        );
        fs.chmodSync(state, 0o700);

        fs.chmodSync(target, 0o666);
        assert.throws(
            () => appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{}', 64),
            /telemetry_file_permissions_unsafe/,
        );
        assert.throws(
            () => readBoundedTelemetryFile(root, path.join('.agents', 'state', 'synthetic.jsonl')),
            /telemetry_file_permissions_unsafe/,
        );
        fs.chmodSync(target, 0o600);
    });

    it('drops telemetry instead of racing an existing writer lock', () => {
        const root = fixture();
        assert.equal(appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{"id":1}', 64), true);
        const state = path.join(root, '.agents', 'state');
        fs.mkdirSync(path.join(state, 'synthetic.jsonl.lock'), { mode: 0o700 });

        assert.equal(appendBoundedTelemetryLine(root, 'synthetic.jsonl', '{"id":2}', 64), false);
        assert.equal(
            fs.readFileSync(path.join(state, 'synthetic.jsonl'), 'utf8'),
            '{"id":1}\n',
        );
    });
});
