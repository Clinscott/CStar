import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    readlinkSync,
    realpathSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const VERIFICATION_RECEIPT_VERSION = 'cstar.repository_verification_evidence.v1';

export interface VerificationStep {
    id: string;
    command: string;
    args: string[];
    testRunner?: 'node-tap' | 'pytest';
}

export interface TestCounts {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    todo: number;
    cancelled: number;
}

export interface SourceManifestEntry {
    path: string;
    tracked: boolean;
    kind: 'file' | 'symlink' | 'missing';
    bytes: number | null;
    sha256: string | null;
}

export interface SourceEvidence {
    head: string;
    dirty: boolean;
    untracked_count: number;
    git_status_porcelain_sha256: string;
    package_lock_sha256: string;
    manifest_scope: 'git_tracked_and_untracked_non_ignored';
    manifest_sha256: string;
    manifest: SourceManifestEntry[];
    binding_sha256: string;
}

interface StepReceipt {
    id: string;
    command: string[];
    status: 'passed' | 'failed';
    exit_code: number | null;
    signal: string | null;
    spawn_error: string | null;
    started_at: string;
    completed_at: string;
    duration_ms: number;
    stdout_bytes: number;
    stdout_sha256: string;
    stderr_bytes: number;
    stderr_sha256: string;
    test_counts: TestCounts | null;
}

export interface VerificationReceipt {
    schema: typeof VERIFICATION_RECEIPT_VERSION;
    evidence_only: true;
    authority: 'none';
    lifecycle_effect: 'none';
    cstar_acceptance: false;
    hall_mutation: false;
    notice: string;
    outcome: 'commands_passed' | 'commands_failed';
    started_at: string;
    completed_at: string;
    duration_ms: number;
    environment: {
        platform: NodeJS.Platform;
        architecture: string;
        node_version: string;
    };
    source: SourceEvidence;
    command_list: Array<{ id: string; argv: string[] }>;
    steps: StepReceipt[];
    test_counts: TestCounts;
    receipt_checksum_scope: 'sha256_of_json_without_receipt_sha256';
    receipt_sha256: string;
}

type Spawn = (
    command: string,
    args: string[],
    options: Parameters<typeof spawnSync>[2],
) => SpawnSyncReturns<Buffer>;

interface VerificationOptions {
    plan?: VerificationStep[];
    receiptDirectory?: string;
    spawn?: Spawn;
    echoOutput?: boolean;
}

const EMPTY_TEST_COUNTS: TestCounts = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    todo: 0,
    cancelled: 0,
};

function sha256(value: Buffer | string): string {
    return createHash('sha256').update(value).digest('hex');
}

function comparePaths(left: string, right: string): number {
    return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function gitBuffer(root: string, args: string[]): Buffer {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: null,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0 || result.error) {
        const detail = result.stderr?.toString('utf8').trim() || result.error?.message || 'unknown error';
        throw new Error(`git ${args.join(' ')} failed: ${detail}`);
    }
    return result.stdout ?? Buffer.alloc(0);
}

function nulPaths(value: Buffer): string[] {
    return value.toString('utf8').split('\0').filter((entry) => entry.length > 0);
}

function readManifestBytes(
    root: string,
    relativePath: string,
): Pick<SourceManifestEntry, 'kind' | 'bytes' | 'sha256'> {
    const absolutePath = path.resolve(root, relativePath);
    if (!isInside(absolutePath, root)) {
        throw new Error(`Git returned a path outside the repository: ${relativePath}`);
    }
    const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
    if (!stat) {
        return { kind: 'missing', bytes: null, sha256: null };
    }
    let content: Buffer;
    let kind: SourceManifestEntry['kind'];
    if (stat.isSymbolicLink()) {
        content = Buffer.from(readlinkSync(absolutePath), 'utf8');
        kind = 'symlink';
    } else if (stat.isFile()) {
        content = readFileSync(absolutePath);
        kind = 'file';
    } else {
        throw new Error(`Manifest path is neither a file nor a symlink: ${relativePath}`);
    }
    return { kind, bytes: content.byteLength, sha256: sha256(content) };
}

export function collectSourceEvidence(root: string): SourceEvidence {
    const resolvedRoot = realpathSync(path.resolve(root));
    const topLevel = realpathSync(gitBuffer(resolvedRoot, ['rev-parse', '--show-toplevel'])
        .toString('utf8').trim());
    if (path.relative(resolvedRoot, topLevel) !== '') {
        throw new Error('Verification root must be the Git worktree root.');
    }

    const tracked = new Set(nulPaths(gitBuffer(resolvedRoot, ['ls-files', '-z', '--cached'])));
    const untracked = new Set(nulPaths(gitBuffer(
        resolvedRoot,
        ['ls-files', '-z', '--others', '--exclude-standard'],
    )));
    const manifest = [...new Set([...tracked, ...untracked])]
        .sort(comparePaths)
        .map((relativePath): SourceManifestEntry => ({
            path: relativePath,
            tracked: tracked.has(relativePath),
            ...readManifestBytes(resolvedRoot, relativePath),
        }));
    const status = gitBuffer(
        resolvedRoot,
        ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    );
    const head = gitBuffer(resolvedRoot, ['rev-parse', 'HEAD']).toString('utf8').trim();
    const packageLockPath = path.join(resolvedRoot, 'package-lock.json');
    if (!existsSync(packageLockPath)) {
        throw new Error('Verification requires package-lock.json.');
    }
    const packageLockSha256 = sha256(readFileSync(packageLockPath));
    const manifestSha256 = sha256(JSON.stringify(manifest));
    const bindingSha256 = sha256(JSON.stringify({
        head,
        git_status_porcelain_sha256: sha256(status),
        package_lock_sha256: packageLockSha256,
        manifest,
    }));

    return {
        head,
        dirty: status.byteLength > 0,
        untracked_count: untracked.size,
        git_status_porcelain_sha256: sha256(status),
        package_lock_sha256: packageLockSha256,
        manifest_scope: 'git_tracked_and_untracked_non_ignored',
        manifest_sha256: manifestSha256,
        manifest,
        binding_sha256: bindingSha256,
    };
}

const NODE_TEST_PATTERN = /\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/u;

export function discoverNodeTestFiles(root: string): string[] {
    const testsRoot = path.join(path.resolve(root), 'tests');
    const discovered: string[] = [];
    const visit = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = path.relative(path.resolve(root), absolutePath).split(path.sep).join('/');
            if (entry.isDirectory()) {
                if (relativePath === 'tests/quarantine') continue;
                visit(absolutePath);
            } else if (entry.isFile() && NODE_TEST_PATTERN.test(entry.name)) {
                discovered.push(relativePath);
            }
        }
    };
    visit(testsRoot);
    return discovered.sort(comparePaths);
}

export function createVerificationPlan(root = process.cwd()): VerificationStep[] {
    return [
        { id: 'repository-diff', command: 'git', args: ['diff', '--check', 'HEAD', '--'] },
        { id: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
        {
            id: 'node-tests',
            command: 'node',
            args: [
                'scripts/run-tsx.mjs',
                '--test',
                '--test-reporter=tap',
                '--test-concurrency=2',
                ...discoverNodeTestFiles(root),
            ],
            testRunner: 'node-tap',
        },
        {
            id: 'python-tests',
            command: 'node',
            args: ['scripts/run-python.mjs', '-m', 'pytest', 'tests', '--ignore=tests/quarantine'],
            testRunner: 'pytest',
        },
        {
            id: 'distribution-contracts',
            command: 'npm',
            args: ['run', 'validate:distributions'],
        },
    ];
}

function numericMatch(text: string, expression: RegExp): number {
    const match = expression.exec(text);
    return match ? Number.parseInt(match[1], 10) : 0;
}

export function parseTestCounts(
    runner: VerificationStep['testRunner'],
    stdout: Buffer,
    stderr: Buffer,
): TestCounts | null {
    const text = `${stdout.toString('utf8')}\n${stderr.toString('utf8')}`;
    if (runner === 'node-tap') {
        if (!/^# tests \d+$/mu.test(text)) return null;
        return {
            total: numericMatch(text, /^# tests (\d+)$/mu),
            passed: numericMatch(text, /^# pass (\d+)$/mu),
            failed: numericMatch(text, /^# fail (\d+)$/mu),
            skipped: numericMatch(text, /^# skipped (\d+)$/mu),
            todo: numericMatch(text, /^# todo (\d+)$/mu),
            cancelled: numericMatch(text, /^# cancelled (\d+)$/mu),
        };
    }
    if (runner === 'pytest') {
        const counts = { ...EMPTY_TEST_COUNTS };
        const labels: Record<string, keyof TestCounts> = {
            passed: 'passed',
            failed: 'failed',
            error: 'failed',
            errors: 'failed',
            skipped: 'skipped',
            xfailed: 'todo',
            xpassed: 'passed',
        };
        let found = false;
        for (const match of text.matchAll(/(\d+) (passed|failed|errors?|skipped|xfailed|xpassed)\b/gu)) {
            found = true;
            counts[labels[match[2]]] += Number.parseInt(match[1], 10);
        }
        if (!found) return null;
        counts.total = counts.passed + counts.failed + counts.skipped + counts.todo;
        return counts;
    }
    return null;
}

function aggregateTestCounts(steps: StepReceipt[]): TestCounts {
    return steps.reduce<TestCounts>((total, step) => {
        if (!step.test_counts) return total;
        for (const key of Object.keys(total) as Array<keyof TestCounts>) {
            total[key] += step.test_counts[key];
        }
        return total;
    }, { ...EMPTY_TEST_COUNTS });
}

export function resolveReceiptDirectory(root: string, requested?: string): string {
    const resolvedRoot = realpathSync(path.resolve(root));
    const candidate = path.resolve(
        resolvedRoot,
        requested?.trim() || path.join('.cstar', 'verification', 'receipts'),
    );
    if (!isInside(candidate, resolvedRoot)) {
        throw new Error('Verification receipt directory must stay inside the repository.');
    }

    let existingAncestor = candidate;
    while (!existsSync(existingAncestor)) {
        const parent = path.dirname(existingAncestor);
        if (parent === existingAncestor) break;
        existingAncestor = parent;
    }
    if (!isInside(realpathSync(existingAncestor), resolvedRoot)) {
        throw new Error('Verification receipt directory resolves outside the repository.');
    }
    return candidate;
}

function atomicWrite(destination: string, payload: string): void {
    const temporary = path.join(
        path.dirname(destination),
        `.${path.basename(destination)}.tmp-${process.pid}-${randomUUID()}`,
    );
    try {
        writeFileSync(temporary, payload, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        renameSync(temporary, destination);
    } catch (error) {
        if (existsSync(temporary)) unlinkSync(temporary);
        throw error;
    }
}

export function computeReceiptChecksum(receipt: VerificationReceipt): string {
    const { receipt_sha256: _excluded, ...checksumBody } = receipt;
    return sha256(JSON.stringify(checksumBody));
}

function writeReceipt(
    root: string,
    requestedDirectory: string | undefined,
    receipt: VerificationReceipt,
): { receiptPath: string; latestPath: string } {
    const directory = resolveReceiptDirectory(root, requestedDirectory);
    mkdirSync(directory, { recursive: true });
    const resolvedRoot = realpathSync(path.resolve(root));
    if (!isInside(realpathSync(directory), resolvedRoot)) {
        throw new Error('Verification receipt directory resolves outside the repository.');
    }
    const stamp = receipt.completed_at.replace(/[:.]/gu, '-');
    const receiptPath = path.join(directory, `${stamp}-${receipt.receipt_sha256.slice(0, 12)}.json`);
    const latestPath = path.join(directory, 'latest.json');
    const payload = `${JSON.stringify(receipt, null, 2)}\n`;
    atomicWrite(receiptPath, payload);
    atomicWrite(latestPath, payload);
    return { receiptPath, latestPath };
}

function asBuffer(value: Buffer | string | null | undefined): Buffer {
    if (Buffer.isBuffer(value)) return value;
    return Buffer.from(value ?? '', 'utf8');
}

export function runVerification(
    root = process.cwd(),
    options: VerificationOptions = {},
): { receipt: VerificationReceipt; receiptPath: string; latestPath: string } {
    const resolvedRoot = realpathSync(path.resolve(root));
    if (!existsSync(path.join(resolvedRoot, 'package.json'))) {
        throw new Error('Verification must run from the CStar Git worktree root.');
    }
    const source = collectSourceEvidence(resolvedRoot);
    const plan = options.plan ?? createVerificationPlan(resolvedRoot);
    const spawn = options.spawn ?? spawnSync;
    const started = Date.now();
    const steps: StepReceipt[] = [];

    for (const step of plan) {
        const stepStarted = Date.now();
        const result = spawn(step.command, step.args, {
            cwd: resolvedRoot,
            env: process.env,
            encoding: null,
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            maxBuffer: 64 * 1024 * 1024,
        });
        const stepCompleted = Date.now();
        const stdout = asBuffer(result.stdout);
        const stderr = asBuffer(result.stderr);
        if (options.echoOutput !== false) {
            if (stdout.byteLength > 0) process.stdout.write(stdout);
            if (stderr.byteLength > 0) process.stderr.write(stderr);
        }
        const passed = result.status === 0 && result.error === undefined;
        steps.push({
            id: step.id,
            command: [step.command, ...step.args],
            status: passed ? 'passed' : 'failed',
            exit_code: result.status,
            signal: result.signal,
            spawn_error: result.error?.message ?? null,
            started_at: new Date(stepStarted).toISOString(),
            completed_at: new Date(stepCompleted).toISOString(),
            duration_ms: stepCompleted - stepStarted,
            stdout_bytes: stdout.byteLength,
            stdout_sha256: sha256(stdout),
            stderr_bytes: stderr.byteLength,
            stderr_sha256: sha256(stderr),
            test_counts: parseTestCounts(step.testRunner, stdout, stderr),
        });
    }

    const completed = Date.now();
    const receipt: VerificationReceipt = {
        schema: VERIFICATION_RECEIPT_VERSION,
        evidence_only: true,
        authority: 'none',
        lifecycle_effect: 'none',
        cstar_acceptance: false,
        hall_mutation: false,
        notice: 'Local evidence only; this receipt does not record or imply CStar acceptance.',
        outcome: steps.every((step) => step.status === 'passed')
            ? 'commands_passed'
            : 'commands_failed',
        started_at: new Date(started).toISOString(),
        completed_at: new Date(completed).toISOString(),
        duration_ms: completed - started,
        environment: {
            platform: process.platform,
            architecture: process.arch,
            node_version: process.version,
        },
        source,
        command_list: plan.map((step) => ({
            id: step.id,
            argv: [step.command, ...step.args],
        })),
        steps,
        test_counts: aggregateTestCounts(steps),
        receipt_checksum_scope: 'sha256_of_json_without_receipt_sha256',
        receipt_sha256: '',
    };
    receipt.receipt_sha256 = computeReceiptChecksum(receipt);
    return { receipt, ...writeReceipt(resolvedRoot, options.receiptDirectory, receipt) };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
    try {
        const result = runVerification();
        console.log(`\nLocal verification evidence: ${result.receipt.outcome}.`);
        console.log('Authority: none; CStar acceptance: false; Hall mutation: false.');
        console.log(`Receipt: ${path.relative(process.cwd(), result.receiptPath)}`);
        process.exitCode = result.receipt.outcome === 'commands_passed' ? 0 : 1;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
