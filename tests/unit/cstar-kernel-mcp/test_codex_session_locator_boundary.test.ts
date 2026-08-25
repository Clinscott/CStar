import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
    findCodexSessionFile,
    resolveCodexSessionsRoot,
} from '../../../src/tools/cstar-kernel-mcp/tools/codex_session_locator.js';

const WINDOWS_CI_TEST_FLAG = 'CSTAR_HALL_STORE_WINDOWS_CI_TEST_ONLY';
const roots: string[] = [];

function makeRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cstar-session-locator-'));
    roots.push(root);
    return root;
}

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}

function withUnavailableUid(
    platform: NodeJS.Platform,
    env: { nodeTestContext?: string; windowsCiTestFlag?: string },
    codexHome: string,
    run: () => void,
): void {
    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const getuidDescriptor = Object.getOwnPropertyDescriptor(process, 'getuid');
    const nodeTestContext = process.env.NODE_TEST_CONTEXT;
    const windowsCiTestFlag = process.env[WINDOWS_CI_TEST_FLAG];
    const originalCodexHome = process.env.CODEX_HOME;
    try {
        Object.defineProperty(process, 'platform', {
            ...platformDescriptor,
            value: platform,
        });
        Object.defineProperty(process, 'getuid', {
            configurable: true,
            enumerable: true,
            value: undefined,
            writable: true,
        });
        restoreEnv('NODE_TEST_CONTEXT', env.nodeTestContext);
        restoreEnv(WINDOWS_CI_TEST_FLAG, env.windowsCiTestFlag);
        process.env.CODEX_HOME = codexHome;
        run();
    } finally {
        Object.defineProperty(process, 'platform', platformDescriptor);
        if (getuidDescriptor) Object.defineProperty(process, 'getuid', getuidDescriptor);
        else Reflect.deleteProperty(process, 'getuid');
        restoreEnv('NODE_TEST_CONTEXT', nodeTestContext);
        restoreEnv(WINDOWS_CI_TEST_FLAG, windowsCiTestFlag);
        restoreEnv('CODEX_HOME', originalCodexHome);
    }
}

function makeOwnershipFixture(threadId: string) {
    const codexHome = makeRoot();
    const sessionsRoot = path.join(codexHome, 'sessions');
    const nested = path.join(sessionsRoot, '2026', '07', '30');
    fs.mkdirSync(nested, { recursive: true, mode: 0o700 });
    const sessionFile = path.join(nested, `rollout-${threadId}.jsonl`);
    fs.writeFileSync(sessionFile, '{}\n', { mode: 0o600 });
    return { codexHome, sessionsRoot, sessionFile, threadId };
}

function assertOwnershipChecksFail(fixture: ReturnType<typeof makeOwnershipFixture>): void {
    assert.throws(
        () => resolveCodexSessionsRoot(),
        /operator_authorization_sessions_root_is_not_a_real_directory/,
    );
    assert.throws(
        () => findCodexSessionFile(fixture.sessionsRoot, fixture.threadId),
        /operator_authorization_session_file_is_unsafe/,
    );
}

afterEach(() => {
    while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Codex session locator storage boundary', () => {
    it('finds one nested exact thread file without whole-directory materialization', () => {
        const root = makeRoot();
        const nested = path.join(root, '2026', '07', '14');
        fs.mkdirSync(nested, { recursive: true });
        const expected = path.join(nested, 'rollout-019f0000-0000-7000-8000-000000000001.jsonl');
        fs.writeFileSync(expected, '{}\n', { mode: 0o600 });

        assert.equal(
            findCodexSessionFile(root, '019f0000-0000-7000-8000-000000000001'),
            expected,
        );

        const source = fs.readFileSync(
            new URL('../../../src/tools/cstar-kernel-mcp/tools/codex_session_locator.ts', import.meta.url),
            'utf8',
        );
        assert.doesNotMatch(source, /readdirSync/);
        assert.match(source, /MAX_SESSION_FILES_SCANNED/);
        assert.match(source, /MAX_SESSION_DIRECTORY_DEPTH/);
    });

    it('fails closed on duplicate matches and excessive nesting', () => {
        const duplicateRoot = makeRoot();
        const thread = '019f0000-0000-7000-8000-000000000002';
        for (const branch of ['a', 'b']) {
            const directory = path.join(duplicateRoot, branch);
            fs.mkdirSync(directory);
            fs.writeFileSync(path.join(directory, `rollout-${thread}.jsonl`), '{}\n', { mode: 0o600 });
        }
        assert.throws(
            () => findCodexSessionFile(duplicateRoot, thread),
            /operator_authorization_session_match_count:2/,
        );

        const deepRoot = makeRoot();
        let directory = deepRoot;
        for (let depth = 0; depth < 18; depth += 1) {
            directory = path.join(directory, `d${depth}`);
            fs.mkdirSync(directory);
        }
        assert.throws(
            () => findCodexSessionFile(deepRoot, thread),
            /operator_authorization_session_depth_limit_exceeded/,
        );
    });

    it('keeps production Windows fail-closed without either test gate', () => {
        const fixture = makeOwnershipFixture('019f0000-0000-7000-8000-000000000003');
        withUnavailableUid('win32', {}, fixture.codexHome, () => {
            assertOwnershipChecksFail(fixture);
        });
    });

    it('requires both Node test context and the exact Windows CI test flag', () => {
        const fixture = makeOwnershipFixture('019f0000-0000-7000-8000-000000000004');
        for (const env of [
            { windowsCiTestFlag: '1' },
            { nodeTestContext: 'child-v8' },
            { nodeTestContext: 'child-v8', windowsCiTestFlag: 'true' },
        ]) {
            withUnavailableUid('win32', env, fixture.codexHome, () => {
                assertOwnershipChecksFail(fixture);
            });
        }
    });

    it('keeps the test seam unavailable outside Windows', () => {
        const fixture = makeOwnershipFixture('019f0000-0000-7000-8000-000000000005');
        withUnavailableUid('linux', {
            nodeTestContext: 'child-v8',
            windowsCiTestFlag: '1',
        }, fixture.codexHome, () => {
            assertOwnershipChecksFail(fixture);
        });
    });

    it('allows unverified ownership only for exact dual-gated Windows CI tests', () => {
        const fixture = makeOwnershipFixture('019f0000-0000-7000-8000-000000000006');
        withUnavailableUid('win32', {
            nodeTestContext: 'child-v8',
            windowsCiTestFlag: '1',
        }, fixture.codexHome, () => {
            assert.equal(resolveCodexSessionsRoot(), fs.realpathSync(fixture.sessionsRoot));
            assert.equal(
                findCodexSessionFile(fixture.sessionsRoot, fixture.threadId),
                fs.realpathSync(fixture.sessionFile),
            );
        });
    });
});
