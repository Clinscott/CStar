import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { CorvusProcess } from '../../src/node/core/CorvusProcess.js';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

describe('CorvusProcess: Empire Supervisor Logic', async () => {
    let cp: CorvusProcess;

    beforeEach(() => {
        cp = new CorvusProcess('tests/fixtures/dummy_daemon.py');
    });

    afterEach(async () => {
        if (cp) {
            await cp.terminate();
        }
    });

    it('should correctly buffer and parse fragmented NDJSON data', (t, done) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = stdout;
        mockChild.stderr = stderr;
        mockChild.stdin = { write: () => true };
        mockChild.kill = (signal: string) => { mockChild.emit('close', 0); };

        // @ts-ignore
        (cp as any)._spawn = () => {
            (cp as any).daemon = mockChild;
            (cp as any).isRunning = true;
            (cp as any).setupOutputBoundary();
        };

        cp.boot();

        cp.on('telemetry', (data) => {
            if (data.type === 'TELEMETRY' && data.message === 'Complete message') {
                done();
            }
        });

        stdout.write('{"message": "Complete ');
        setTimeout(() => {
            stdout.write('message"}\n');
        }, 10);
    });

    it('should emit SYSTEM_RESTART on daemon crash', (t, done) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = stdout;
        mockChild.stderr = stderr;
        mockChild.kill = (signal: string) => { mockChild.emit('close', 0); };

        // @ts-ignore
        (cp as any)._spawn = () => {
            (cp as any).daemon = mockChild;
            (cp as any).isRunning = true;
            (cp as any).setupOutputBoundary();
            (cp as any).setupFaultTolerance();
        };

        cp.boot();

        cp.on('telemetry', (data) => {
            if (data.type === 'SYSTEM_RESTART') {
                try {
                    assert.strictEqual(data.status, 'rebooting');
                    done();
                } catch (err) {
                    // Ignore transient errors if any
                }
            }
        });

        // Trigger close event on the mock child
        mockChild.emit('close', 1);
    });

    it('should fall back to HUD_STREAM', (t, done) => {
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        const mockChild = new EventEmitter() as any;
        mockChild.stdout = stdout;
        mockChild.stderr = stderr;
        mockChild.kill = (signal: string) => { mockChild.emit('close', 0); };

        // @ts-ignore
        (cp as any)._spawn = () => {
            (cp as any).daemon = mockChild;
            (cp as any).isRunning = true;
            (cp as any).setupOutputBoundary();
        };

        cp.boot();

        cp.on('telemetry', (data) => {
            if (data.type === 'HUD_STREAM') {
                assert.strictEqual(data.message, '[ALFRED] Test');
                done();
            }
        });

        stdout.write('[ALFRED] Test\n');
    });
});
