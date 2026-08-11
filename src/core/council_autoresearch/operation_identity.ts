import fs from 'node:fs';
import { hostname as systemHostname } from 'node:os';

import {
    fail,
    sha256,
} from './contracts.js';
import {
    assertRepositoryOperationOwner,
    type RepositoryOperationOwner,
} from './repository_lease_contract.js';

export {
    assertRepositoryOperationOwner,
    type RepositoryOperationOwner,
} from './repository_lease_contract.js';

const PROC_SUPER_MAGIC = 0x9fa0n;
const PROCESS_STAT_MAX_BYTES = 8 * 1024;
const PROCESS_STATUS_MAX_BYTES = 64 * 1024;
const SYSTEM_IDENTITY_MAX_BYTES = 128;
const PROCESS_STATES = new Set(['R', 'S', 'D', 'Z', 'T', 't', 'W', 'X', 'x', 'K', 'P', 'I']);

interface LinuxProcessStat {
    pid: number;
    state: string;
    startTicks: string;
}

function assertTrustedProcfs(): void {
    if (process.platform !== 'linux') fail('repository operation identity requires Linux procfs');
    const proc = fs.lstatSync('/proc', { bigint: true });
    const filesystem = fs.statfsSync('/proc', { bigint: true });
    if (proc.isSymbolicLink() || !proc.isDirectory() || proc.uid !== 0n
        || (proc.mode & 0o022n) !== 0n || fs.realpathSync('/proc') !== '/proc'
        || filesystem.type !== PROC_SUPER_MAGIC) {
        fail('repository operation identity requires a canonical trusted Linux procfs');
    }
}

function readBoundedNoFollow(file: string, label: string, maxBytes: number): string {
    const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const before = fs.fstatSync(descriptor, { bigint: true });
        if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1n) {
            fail(`${label} must be a single-link regular file`);
        }
        if (before.size > 0n && before.size > BigInt(maxBytes)) fail(`${label} exceeds its byte limit`);
        const chunks: Buffer[] = [];
        let total = 0;
        while (true) {
            const chunk = Buffer.allocUnsafe(Math.min(4096, maxBytes + 1 - total));
            const bytesRead = fs.readSync(descriptor, chunk, 0, chunk.length, null);
            if (bytesRead === 0) break;
            total += bytesRead;
            if (total > maxBytes) fail(`${label} exceeds its byte limit`);
            chunks.push(chunk.subarray(0, bytesRead));
        }
        const after = fs.fstatSync(descriptor, { bigint: true });
        for (const key of [
            'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
        ] as const) {
            if (before[key] !== after[key]) fail(`${label} changed while it was read`);
        }
        const linked = fs.lstatSync(file, { bigint: true });
        if (linked.isSymbolicLink() || !linked.isFile() || linked.nlink !== 1n) {
            fail(`${label} path changed while it was read`);
        }
        for (const key of [
            'dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs',
        ] as const) {
            if (linked[key] !== after[key]) fail(`${label} path changed while it was read`);
        }
        return Buffer.concat(chunks, total).toString('utf8');
    } finally {
        fs.closeSync(descriptor);
    }
}

function machineIdentity(): string {
    const file = '/etc/machine-id';
    const stat = fs.lstatSync(file, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n || stat.uid !== 0n
        || (stat.mode & 0o022n) !== 0n || fs.realpathSync(file) !== file) {
        fail('Linux machine identity is not a canonical root-controlled regular file');
    }
    const value = readBoundedNoFollow(file, 'Linux machine identity', SYSTEM_IDENTITY_MAX_BYTES);
    const match = /^([a-fA-F0-9]{32})\n?$/.exec(value);
    if (!match || /^0{32}$/.test(match[1])) fail('Linux machine identity is malformed');
    return sha256(match[1].toLowerCase());
}

function bootIdentity(): string {
    const value = readBoundedNoFollow(
        '/proc/sys/kernel/random/boot_id',
        'Linux boot identity',
        SYSTEM_IDENTITY_MAX_BYTES,
    );
    const match = /^([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\n?$/.exec(value);
    if (!match) fail('Linux boot identity is malformed');
    return sha256(match[1].toLowerCase());
}

function pidNamespaceIdentity(): string {
    const file = '/proc/self/ns/pid';
    const before = fs.lstatSync(file, { bigint: true });
    if (!before.isSymbolicLink() || before.nlink !== 1n) fail('Linux PID namespace path is invalid');
    const value = fs.readlinkSync(file);
    const after = fs.lstatSync(file, { bigint: true });
    for (const key of ['dev', 'ino', 'mode', 'nlink', 'uid', 'gid', 'mtimeNs', 'ctimeNs'] as const) {
        if (before[key] !== after[key]) fail('Linux PID namespace changed while it was read');
    }
    if (!/^pid:\[[1-9][0-9]*\]$/.test(value)) fail('Linux PID namespace identity is malformed');
    return sha256(value);
}

function parseProcessStat(value: string, expectedPid?: number): LinuxProcessStat {
    const open = value.indexOf(' (');
    const close = value.lastIndexOf(')');
    const pidText = open < 1 ? '' : value.slice(0, open);
    const fields = close <= open ? [] : value.slice(close + 1).trim().split(/\s+/);
    const state = fields[0];
    const startTicks = fields[19];
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid < 1 || (expectedPid !== undefined && pid !== expectedPid)
        || !PROCESS_STATES.has(state ?? '') || !/^[1-9][0-9]*$/.test(startTicks ?? '')) {
        fail('Linux process start identity is malformed');
    }
    return { pid, state, startTicks };
}

function currentProcfsProcessStat(): LinuxProcessStat {
    const value = readBoundedNoFollow(
        '/proc/self/stat',
        'current Linux process stat',
        PROCESS_STAT_MAX_BYTES,
    );
    return parseProcessStat(value);
}

function assertCurrentPidMapping(procfsPid: number): void {
    const status = readBoundedNoFollow(
        '/proc/self/status',
        'current Linux process status',
        PROCESS_STATUS_MAX_BYTES,
    );
    const records = status.split('\n').filter((line) => line.startsWith('NSpid:'));
    const match = records.length === 1 ? /^NSpid:\s+([1-9][0-9]*(?:\s+[1-9][0-9]*)*)$/.exec(records[0]) : null;
    const pids = match ? match[1].split(/\s+/).map(Number) : [];
    if (pids.length < 1 || pids.some((pid) => !Number.isSafeInteger(pid) || pid < 1)
        || pids[0] !== procfsPid || pids[pids.length - 1] !== process.pid) {
        fail('Linux procfs PID namespace mapping is malformed');
    }
}

function processStat(pid: number): LinuxProcessStat | undefined {
    const directory = `/proc/${pid}`;
    try {
        const stat = fs.lstatSync(directory, { bigint: true });
        if (stat.isSymbolicLink() || !stat.isDirectory() || fs.realpathSync(directory) !== directory) {
            fail('Linux process directory is not canonical');
        }
        const value = readBoundedNoFollow(
            pathForProcessStat(pid),
            'Linux process stat',
            PROCESS_STAT_MAX_BYTES,
        );
        return parseProcessStat(value, pid);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

function pathForProcessStat(pid: number): string {
    return `/proc/${pid}/stat`;
}

function localIdentity(): Omit<RepositoryOperationOwner, 'pid' | 'process_start_ticks'> {
    assertTrustedProcfs();
    const hostname = systemHostname();
    if (!hostname || hostname.length > 255 || /[\r\n\0]/.test(hostname)) {
        fail('Linux hostname is invalid');
    }
    return {
        hostname,
        machine_id_sha256: machineIdentity(),
        boot_id_sha256: bootIdentity(),
        pid_namespace_sha256: pidNamespaceIdentity(),
    };
}

export function currentOperationOwner(): RepositoryOperationOwner {
    const local = localIdentity();
    const processIdentity = currentProcfsProcessStat();
    assertCurrentPidMapping(processIdentity.pid);
    const owner: RepositoryOperationOwner = {
        pid: processIdentity.pid,
        ...local,
        process_start_ticks: processIdentity.startTicks,
    };
    assertRepositoryOperationOwner(owner);
    return owner;
}

export function operationOwnerDefinitelyDead(owner: RepositoryOperationOwner): boolean {
    assertRepositoryOperationOwner(owner);
    const local = localIdentity();
    if (owner.hostname !== local.hostname || owner.machine_id_sha256 !== local.machine_id_sha256) {
        fail('cross-host repository operation recovery is forbidden');
    }
    if (owner.boot_id_sha256 !== local.boot_id_sha256) return true;
    if (owner.pid_namespace_sha256 !== local.pid_namespace_sha256) {
        fail('cross-session repository operation recovery is forbidden');
    }
    const processIdentity = processStat(owner.pid);
    return processIdentity === undefined
        || processIdentity.startTicks !== owner.process_start_ticks
        || ['Z', 'X', 'x'].includes(processIdentity.state);
}
