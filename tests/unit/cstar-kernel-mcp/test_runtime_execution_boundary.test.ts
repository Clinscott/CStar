import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { formatBootstrapErrorRecord } from '../../../src/tools/cstar-kernel-mcp/contracts/runtime.js';
import {
    logBootstrapError as logLauncherBootstrapError,
    MCP_BOOTSTRAP_LOG_MAX_BYTES,
} from '../../../bin/cstar-kernel-mcp-bootstrap-log.js';
import { getCstarKernelToolCatalogEntry } from '../../../src/tools/cstar-kernel-mcp/contracts/tool_catalog.js';
import { attachSourceWatcher } from '../../../src/tools/cstar-kernel-mcp/watch.js';

describe('CStar runtime execution classification boundary', () => {
    it('classifies the mixed Warden surface at its highest-effect scan action', () => {
        const entry = getCstarKernelToolCatalogEntry('cstar_warden');
        assert.equal(entry.toolClass, 'EXECUTION');
        assert.match(entry.description, /scan starts a constrained project-venv process/);
    });

    it('keeps the kernel source watcher disabled unless explicitly enabled', async () => {
        const root = fs.mkdtempSync(`${os.tmpdir()}/cstar-watch-default-off-`);
        let exits = 0;
        try {
            const detach = await attachSourceWatcher(root, () => { exits += 1; }, {});
            await detach();
            assert.equal(exits, 0);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('formats bootstrap failures as bounded redacted codes and fingerprints', () => {
        const error = Object.assign(new Error('token=secret-value at /private/operator/path'), {
            code: 'ENOENT',
        });
        const record = formatBootstrapErrorRecord(error, new Date('2026-07-14T00:00:00.000Z'));
        assert.match(record, /^\[2026-07-14T00:00:00\.000Z\] code=enoent fingerprint=[a-f0-9]{16}\n$/);
        assert.doesNotMatch(record, /secret-value|private\/operator|token=/);

        const unknown = formatBootstrapErrorRecord('credential=do-not-persist', new Date(0));
        assert.match(unknown, /code=bootstrap_failure/);
        assert.doesNotMatch(unknown, /credential|do-not-persist/);
    });

    it('writes only a bounded private log and rejects unsafe existing storage', () => {
        const root = fs.mkdtempSync(path.join('/tmp', 'cstar-bootstrap-log-'));
        const outside = fs.mkdtempSync(path.join('/tmp', 'cstar-bootstrap-outside-'));
        try {
            const secret = 'token=synthetic-secret at /private/operator/path';
            logLauncherBootstrapError(root, new Error(secret));
            const logPath = path.join(root, 'logs', 'mcp', 'mcp_bootstrap_error.log');
            const record = fs.readFileSync(logPath, 'utf8');
            assert.doesNotMatch(record, /synthetic-secret|private\/operator|token=/);
            assert.equal(fs.statSync(logPath).mode & 0o777, 0o600);

            fs.writeFileSync(logPath, 'x'.repeat(MCP_BOOTSTRAP_LOG_MAX_BYTES), { mode: 0o600 });
            logLauncherBootstrapError(root, new Error('must-not-append'));
            assert.equal(fs.statSync(logPath).size, MCP_BOOTSTRAP_LOG_MAX_BYTES);

            fs.rmSync(path.join(root, 'logs'), { recursive: true, force: true });
            fs.symlinkSync(outside, path.join(root, 'logs'));
            logLauncherBootstrapError(root, new Error('must-not-follow'));
            assert.deepEqual(fs.readdirSync(outside), []);

            fs.rmSync(path.join(root, 'logs'));
            fs.mkdirSync(path.join(root, 'logs', 'mcp'), { recursive: true, mode: 0o777 });
            fs.chmodSync(path.join(root, 'logs'), 0o777);
            logLauncherBootstrapError(root, new Error('must-not-use-permissive-dir'));
            assert.deepEqual(fs.readdirSync(path.join(root, 'logs', 'mcp')), []);

            fs.chmodSync(path.join(root, 'logs'), 0o700);
            fs.chmodSync(path.join(root, 'logs', 'mcp'), 0o700);
            fs.writeFileSync(logPath, '', { mode: 0o666 });
            fs.chmodSync(logPath, 0o666);
            logLauncherBootstrapError(root, new Error('must-not-use-permissive-file'));
            assert.equal(fs.readFileSync(logPath, 'utf8'), '');

            fs.rmSync(logPath);
            fs.writeFileSync(logPath, '', { mode: 0o600 });
            fs.linkSync(logPath, path.join(root, 'logs', 'mcp', 'linked.log'));
            logLauncherBootstrapError(root, new Error('must-not-use-hardlink'));
            assert.equal(fs.readFileSync(logPath, 'utf8'), '');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });

    it('keeps both bootstrap entrypoints free of raw error output', () => {
        const launcher = fs.readFileSync(path.join(process.cwd(), 'bin/cstar-kernel-mcp.js'), 'utf8');
        const kernel = fs.readFileSync(path.join(process.cwd(), 'src/tools/cstar-kernel-mcp.ts'), 'utf8');
        assert.doesNotMatch(launcher, /error\?\.stack|error\?\.message|appendFileSync|recursive:\s*true/);
        assert.doesNotMatch(kernel, /console\.error\([^\n]*,\s*error\)/);
    });
});
