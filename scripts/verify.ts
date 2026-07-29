import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const VERIFICATION_RECEIPT_VERSION = 'cstar.verification.v1';

export interface VerificationStep {
    id: string;
    command: string;
    args: string[];
}

interface StepReceipt {
    id: string;
    command: string[];
    status: 'passed' | 'failed';
    exit_code: number | null;
    signal: string | null;
    started_at: string;
    completed_at: string;
    duration_ms: number;
}

interface VerificationReceipt {
    schema: typeof VERIFICATION_RECEIPT_VERSION;
    authority: 'cstar_local_verification';
    github_role: 'remote_repository_and_pr_record_only';
    status: 'passed' | 'failed';
    started_at: string;
    completed_at: string;
    duration_ms: number;
    environment: {
        platform: NodeJS.Platform;
        architecture: string;
        node_version: string;
    };
    source: {
        head: string | null;
        dirty: boolean | null;
    };
    steps: StepReceipt[];
}

type Spawn = (
    command: string,
    args: string[],
    options: Parameters<typeof spawnSync>[2],
) => SpawnSyncReturns<Buffer>;

function npmCommand(): string {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function createVerificationPlan(): VerificationStep[] {
    return [
        { id: 'repository-diff', command: 'git', args: ['diff', '--check', 'HEAD'] },
        { id: 'typecheck', command: npmCommand(), args: ['run', 'typecheck'] },
        { id: 'node-tests', command: npmCommand(), args: ['run', 'test:node'] },
        { id: 'python-tests', command: npmCommand(), args: ['run', 'test:python'] },
        { id: 'distribution-contracts', command: npmCommand(), args: ['run', 'validate:distributions'] },
    ];
}

function gitText(root: string, args: string[]): string | null {
    const result = spawnSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.status === 0 ? result.stdout.trim() : null;
}

function isInside(candidate: string, root: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function resolveReceiptDirectory(
    root: string,
    requested = process.env.CSTAR_VERIFY_RECEIPT_DIR,
): string {
    const resolvedRoot = path.resolve(root);
    const receiptDirectory = path.resolve(
        resolvedRoot,
        requested?.trim() || path.join('.cstar', 'verification', 'receipts'),
    );
    if (!isInside(receiptDirectory, resolvedRoot)) {
        throw new Error('Verification receipt directory must stay inside the CStar repository.');
    }
    return receiptDirectory;
}

function writeReceipt(root: string, receipt: VerificationReceipt): { receiptPath: string; latestPath: string } {
    const directory = resolveReceiptDirectory(root);
    mkdirSync(directory, { recursive: true });
    const stamp = receipt.completed_at.replace(/[:.]/gu, '-');
    const receiptPath = path.join(directory, `${stamp}.json`);
    const latestPath = path.join(directory, 'latest.json');
    const payload = `${JSON.stringify(receipt, null, 2)}\n`;
    const temporaryPath = `${receiptPath}.tmp-${process.pid}`;
    writeFileSync(temporaryPath, payload, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, receiptPath);
    const latestTemporaryPath = `${latestPath}.tmp-${process.pid}`;
    writeFileSync(latestTemporaryPath, payload, { encoding: 'utf8', mode: 0o600 });
    renameSync(latestTemporaryPath, latestPath);
    return { receiptPath, latestPath };
}

export function runVerification(
    root = process.cwd(),
    spawn: Spawn = spawnSync,
): { receipt: VerificationReceipt; receiptPath: string; latestPath: string } {
    const resolvedRoot = path.resolve(root);
    if (!existsSync(path.join(resolvedRoot, 'package.json')) || !existsSync(path.join(resolvedRoot, '.git'))) {
        throw new Error('npm run verify must be run from a CStar Git worktree root.');
    }

    const started = Date.now();
    const stepReceipts: StepReceipt[] = [];
    for (const step of createVerificationPlan()) {
        const stepStarted = Date.now();
        const result = spawn(step.command, step.args, {
            cwd: resolvedRoot,
            env: process.env,
            stdio: 'inherit',
            shell: false,
        });
        const stepCompleted = Date.now();
        const passed = result.status === 0 && result.error === undefined;
        stepReceipts.push({
            id: step.id,
            command: [step.command, ...step.args],
            status: passed ? 'passed' : 'failed',
            exit_code: result.status,
            signal: result.signal,
            started_at: new Date(stepStarted).toISOString(),
            completed_at: new Date(stepCompleted).toISOString(),
            duration_ms: stepCompleted - stepStarted,
        });
        if (!passed) break;
    }

    const completed = Date.now();
    const receipt: VerificationReceipt = {
        schema: VERIFICATION_RECEIPT_VERSION,
        authority: 'cstar_local_verification',
        github_role: 'remote_repository_and_pr_record_only',
        status: stepReceipts.length === createVerificationPlan().length
            && stepReceipts.every((step) => step.status === 'passed')
            ? 'passed'
            : 'failed',
        started_at: new Date(started).toISOString(),
        completed_at: new Date(completed).toISOString(),
        duration_ms: completed - started,
        environment: {
            platform: process.platform,
            architecture: process.arch,
            node_version: process.version,
        },
        source: {
            head: gitText(resolvedRoot, ['rev-parse', 'HEAD']),
            dirty: gitText(resolvedRoot, ['status', '--porcelain']) !== '',
        },
        steps: stepReceipts,
    };
    const paths = writeReceipt(resolvedRoot, receipt);
    return { receipt, ...paths };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
    try {
        const result = runVerification();
        console.log(`\nCStar verification ${result.receipt.status}.`);
        console.log(`Receipt: ${path.relative(process.cwd(), result.receiptPath)}`);
        process.exitCode = result.receipt.status === 'passed' ? 0 : 1;
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
