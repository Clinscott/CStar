import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { fail } from './contracts.js';

export const TRUSTED_GIT_EXECUTABLE = '/usr/bin/git' as const;

const FORBIDDEN_AMBIENT_GIT_TOPOLOGY = Object.freeze([
    'GIT_DIR',
    'GIT_COMMON_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_REPLACE_REF_BASE',
] as const);

const TRUSTED_GIT_ENVIRONMENT: Readonly<NodeJS.ProcessEnv> = Object.freeze({
    PATH: '/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_NO_LAZY_FETCH: '1',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
});

export interface TrustedGitRunOptions {
    encoding?: BufferEncoding | 'buffer';
    input?: string | Buffer;
    maxBuffer?: number;
    timeoutMs?: number;
}

function assertRootOwnedDirectory(directory: string): void {
    const stat = fs.lstatSync(directory, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== 0n
        || (stat.mode & 0o022n) !== 0n || fs.realpathSync(directory) !== directory) {
        fail(`trusted Git ancestor is not canonical and root-controlled: ${directory}`);
    }
}

export function assertTrustedGitExecutable(): void {
    let ancestor = path.dirname(TRUSTED_GIT_EXECUTABLE);
    while (true) {
        assertRootOwnedDirectory(ancestor);
        const parent = path.dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
    }
    const stat = fs.lstatSync(TRUSTED_GIT_EXECUTABLE, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || stat.uid !== 0n || stat.nlink !== 1n
        || (stat.mode & 0o111n) === 0n || (stat.mode & 0o022n) !== 0n
        || fs.realpathSync(TRUSTED_GIT_EXECUTABLE) !== TRUSTED_GIT_EXECUTABLE) {
        fail('trusted Git executable is not a canonical root-controlled regular file');
    }
}

function assertNoAmbientGitTopology(): void {
    for (const name of FORBIDDEN_AMBIENT_GIT_TOPOLOGY) {
        if (process.env[name] !== undefined) {
            fail(`ambient Git topology override is forbidden: ${name}`);
        }
    }
}

function validatedOptions(options: TrustedGitRunOptions): Required<Pick<TrustedGitRunOptions, 'maxBuffer' | 'timeoutMs'>> {
    const maxBuffer = options.maxBuffer ?? 16 * 1024 * 1024;
    const timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(maxBuffer) || maxBuffer < 1 || maxBuffer > 64 * 1024 * 1024) {
        fail('trusted Git maxBuffer is invalid');
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
        fail('trusted Git timeout is invalid');
    }
    if (options.input !== undefined) {
        const bytes = Buffer.isBuffer(options.input)
            ? options.input.length
            : Buffer.byteLength(options.input);
        if (bytes > maxBuffer) fail('trusted Git input exceeds its byte limit');
    }
    return { maxBuffer, timeoutMs };
}

function executeTrustedGit(
    cwd: string,
    args: string[],
    options: TrustedGitRunOptions = {},
): string | Buffer {
    assertNoAmbientGitTopology();
    assertTrustedGitExecutable();
    if (args.length < 1 || args.some((argument) => typeof argument !== 'string' || argument.includes('\0'))) {
        fail('trusted Git arguments are invalid');
    }
    const limits = validatedOptions(options);
    const encoding = options.encoding === 'buffer' ? null : options.encoding ?? 'utf8';
    const result = spawnSync(TRUSTED_GIT_EXECUTABLE, [
        '--no-optional-locks',
        '--no-replace-objects',
        '-c', 'core.fsmonitor=false',
        '-c', 'core.hooksPath=/dev/null',
        ...args,
    ], {
        cwd,
        encoding,
        env: TRUSTED_GIT_ENVIRONMENT,
        input: options.input,
        timeout: limits.timeoutMs,
        maxBuffer: limits.maxBuffer,
    });
    if (result.error || result.status !== 0) fail('trusted Git command failed');
    return result.stdout as string | Buffer;
}

export function runTrustedGit(
    repoRoot: string,
    args: string[],
    options: TrustedGitRunOptions = {},
): string | Buffer {
    return executeTrustedGit(fs.realpathSync(repoRoot), args, options);
}

export function runTrustedGitWithoutRepository(
    args: string[],
    options: TrustedGitRunOptions = {},
): string | Buffer {
    return executeTrustedGit('/usr/bin', args, options);
}

export function repositoryRoot(input: string): string {
    const supplied = fs.realpathSync(input);
    const output = String(runTrustedGit(supplied, ['rev-parse', '--show-toplevel'])).trim();
    const top = fs.realpathSync(output);
    if (supplied !== top) fail('repository root must be the Git worktree top-level');
    return top;
}

export function gitCommonDirectory(repoRoot: string): string {
    const root = repositoryRoot(repoRoot);
    const output = String(runTrustedGit(root, ['rev-parse', '--git-common-dir'])).trim();
    const requested = path.resolve(root, output);
    const common = fs.realpathSync(requested);
    const stat = fs.lstatSync(common);
    if (requested !== common || stat.isSymbolicLink() || !stat.isDirectory()) {
        fail('Git common directory is invalid');
    }
    return common;
}

export function sourceHead(repoRoot: string): string {
    const root = repositoryRoot(repoRoot);
    const head = String(runTrustedGit(root, ['rev-parse', 'HEAD'])).trim();
    if (!/^[a-f0-9]{40}$/.test(head)) fail('repository HEAD is not a full Git SHA');
    return head;
}
