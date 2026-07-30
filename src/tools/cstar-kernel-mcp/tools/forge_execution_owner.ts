import { createHash } from 'node:crypto';
import fs from 'node:fs';

export const FORGE_EXECUTION_GRACE_MS = 2_100_000;
export const FORGE_EXECUTION_OWNER_SCHEMA = 'cstar.forge_execution_owner.v1';

export interface ForgeExecutionOwnerProof {
    readonly schema: typeof FORGE_EXECUTION_OWNER_SCHEMA;
    readonly pid: number;
    readonly process_start_ticks: string;
    readonly boot_id_sha256: string;
}

function readProcessStartTicks(pid: number): string | null {
    try {
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const commandEnd = stat.lastIndexOf(')');
        if (commandEnd < 0) return null;
        const fieldsAfterCommand = stat.slice(commandEnd + 2).trim().split(/\s+/);
        const startTicks = fieldsAfterCommand[19];
        return /^\d+$/.test(startTicks ?? '') ? startTicks : null;
    } catch {
        return null;
    }
}

function readBootIdSha256(): string | null {
    try {
        const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
        if (!/^[a-f0-9-]{36}$/i.test(bootId)) return null;
        return createHash('sha256').update(bootId, 'ascii').digest('hex');
    } catch {
        return null;
    }
}

export function buildForgeExecutionOwnerProof(): ForgeExecutionOwnerProof | null {
    if (process.platform !== 'linux') return null;
    const processStartTicks = readProcessStartTicks(process.pid);
    const bootIdSha256 = readBootIdSha256();
    if (!processStartTicks || !bootIdSha256) return null;
    return Object.freeze({
        schema: FORGE_EXECUTION_OWNER_SCHEMA,
        pid: process.pid,
        process_start_ticks: processStartTicks,
        boot_id_sha256: bootIdSha256,
    });
}

export function parseForgeExecutionOwnerProof(value: unknown): ForgeExecutionOwnerProof | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.schema !== FORGE_EXECUTION_OWNER_SCHEMA
        || !Number.isSafeInteger(record.pid) || Number(record.pid) <= 0
        || typeof record.process_start_ticks !== 'string'
        || !/^\d+$/.test(record.process_start_ticks)
        || typeof record.boot_id_sha256 !== 'string'
        || !/^[a-f0-9]{64}$/.test(record.boot_id_sha256)) return null;
    return {
        schema: FORGE_EXECUTION_OWNER_SCHEMA,
        pid: Number(record.pid),
        process_start_ticks: record.process_start_ticks,
        boot_id_sha256: record.boot_id_sha256,
    };
}

/** Null means this host cannot prove liveness; callers must wait for the hard deadline. */
export function isForgeExecutionOwnerAlive(proof: ForgeExecutionOwnerProof): boolean | null {
    const bootIdSha256 = readBootIdSha256();
    if (!bootIdSha256) return null;
    if (bootIdSha256 !== proof.boot_id_sha256) return false;
    const startTicks = readProcessStartTicks(proof.pid);
    return startTicks === null ? false : startTicks === proof.process_start_ticks;
}
