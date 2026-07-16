import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { JS_SENTINEL_RETIRED, runSentinel } from '../../src/tools/js_sentinel.js';
import {
    PENNYONE_LIVE_RETIRED,
    recordPing,
    recordTrace,
} from '../../src/tools/pennyone/live/recorder.js';
import {
    handleTelemetryPing,
    handleTelemetryTrace,
} from '../../src/tools/pennyone/live/telemetry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('legacy JS Sentinel never launches npx or auto-fix', async () => {
    await assert.rejects(
        runSentinel('/home/synthetic/private', true),
        new RegExp(JS_SENTINEL_RETIRED),
    );
    const source = fs.readFileSync(path.join(ROOT, 'src/tools/js_sentinel.ts'), 'utf-8');
    assert.doesNotMatch(source, /\bexeca\b|spawn\(|execFile|--fix.*args|process\.exit\(/);
});

test('legacy live recorder never writes ping or trace state', async () => {
    await assert.rejects(recordPing({} as never, '/home/synthetic/private'), new RegExp(PENNYONE_LIVE_RETIRED));
    await assert.rejects(recordTrace({ secret: 'synthetic' }), new RegExp(PENNYONE_LIVE_RETIRED));
    const source = fs.readFileSync(path.join(ROOT, 'src/tools/pennyone/live/recorder.ts'), 'utf-8');
    assert.doesNotMatch(source, /savePing|saveTrace|getWritableDb/);
});

test('legacy HTTP telemetry returns gone without reading its body', async () => {
    let bodyReads = 0;
    let status = 0;
    let payload: unknown;
    const request = {
        get body() {
            bodyReads += 1;
            throw new Error('body_must_not_be_read');
        },
    } as never;
    const response = {
        status(value: number) { status = value; return this; },
        json(value: unknown) { payload = value; return value; },
    } as never;
    await handleTelemetryPing(request, response, {} as never, '/home/synthetic/private');
    assert.strictEqual(status, 410);
    assert.deepStrictEqual(payload, { error: PENNYONE_LIVE_RETIRED });
    assert.strictEqual(bodyReads, 0);

    status = 0;
    payload = undefined;
    await handleTelemetryTrace(request, response, {} as never);
    assert.strictEqual(status, 410);
    assert.deepStrictEqual(payload, { error: PENNYONE_LIVE_RETIRED });
    assert.strictEqual(bodyReads, 0);
});
