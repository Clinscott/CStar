import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

import type { AutomaticMissionRecord } from '../../../types/automatic_mission.js';
import { buildHallRepositoryId, normalizeHallPath } from '../../../types/hall.js';
import { database } from './database.js';
import { registry } from '../pathRegistry.js';

export const AUTOMATIC_MISSION_DISPATCH_STATES = [
    'queued', 'claimed', 'delivered_unverified', 'validated',
    'failed', 'cancelled', 'expired',
] as const;
export type AutomaticMissionDispatchState =
    typeof AUTOMATIC_MISSION_DISPATCH_STATES[number];
export type AutomaticMissionDispatchSource = 'automatic_mission' | 'augury';

export interface AutomaticMissionDispatchReceipt {
    schema: 'cstar.automatic_mission_dispatch_receipt.v1';
    dispatch_id: string;
    source_kind: AutomaticMissionDispatchSource;
    mission_id: string;
    decision_id: string;
    bead_id: string;
    idempotency_key: string;
    hall_repository_id: string;
    repository_id: string;
    root_path: string;
    state: AutomaticMissionDispatchState;
    created_at: number;
    updated_at: number;
    deadline_at: number;
    claimed_at: number | null;
    claimed_by: string | null;
    delivered_at: number | null;
    validated_at: number | null;
    failed_at: number | null;
    cancelled_at: number | null;
    expired_at: number | null;
    detail: string | null;
    launch_required_by_host: true;
    worker_launch_performed: false;
    receipt_sha256: string;
}

export interface EnqueueAutomaticMissionDispatchInput {
    source_kind: AutomaticMissionDispatchSource;
    mission_id: string;
    decision_id: string;
    bead_id: string;
    idempotency_key: string;
    intent_binding: unknown;
    mission?: AutomaticMissionRecord;
    repository_id?: string;
    root_path?: string;
    deadline_at?: number;
    now?: number;
}

export interface EnqueueAutomaticMissionDispatchResult {
    receipt: AutomaticMissionDispatchReceipt;
    mission?: AutomaticMissionRecord;
    replayed: boolean;
}

export interface AutomaticMissionDispatchStoreOptions {
    db?: Database.Database;
    code_root?: string;
    control_root?: string;
    max_deadline_ms?: number;
    default_deadline_ms?: number;
}

const DEFAULT_DEADLINE_MS = 24 * 60 * 60 * 1_000;
const MAX_DEADLINE_MS = 7 * DEFAULT_DEADLINE_MS;
const BOUNDED_TEXT = /^[^\u0000-\u001f\u007f]{1,512}$/u;

function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, stable(item)]));
    }
    return value;
}

function stableJson(value: unknown): string {
    return JSON.stringify(stable(value));
}

function sha256(value: unknown): string {
    return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildAutomaticMissionDispatchRepositoryId(rootPath: string): string {
    return `repo:cstar:${sha256(normalizeHallPath(rootPath))}`;
}

function canonicalRoot(value: string, code: string): string {
    if (!path.isAbsolute(value) || path.resolve(value) !== value) throw new Error(code);
    let real: string;
    try {
        real = fs.realpathSync.native(value);
    } catch {
        throw new Error(`${code}_uninspectable`);
    }
    if (real !== value) throw new Error(`${code}_noncanonical`);
    return real;
}

function receiptWithHash(
    value: Omit<AutomaticMissionDispatchReceipt, 'receipt_sha256'>,
): AutomaticMissionDispatchReceipt {
    return { ...value, receipt_sha256: sha256(value) };
}

function parseReceipt(value: string): AutomaticMissionDispatchReceipt {
    const receipt = JSON.parse(value) as AutomaticMissionDispatchReceipt;
    const { receipt_sha256, ...unsigned } = receipt;
    if (receipt.worker_launch_performed !== false || sha256(unsigned) !== receipt_sha256) {
        throw new Error('automatic_mission_dispatch_receipt_invalid');
    }
    return receipt;
}

export class AutomaticMissionDispatchStore {
    private readonly providedDb?: Database.Database;
    private readonly codeRoot: string;
    private readonly controlRoot: string;
    private readonly maxDeadlineMs: number;
    private readonly defaultDeadlineMs: number;
    private initialized = false;

    constructor(options: AutomaticMissionDispatchStoreOptions = {}) {
        this.providedDb = options.db;
        this.codeRoot = canonicalRoot(options.code_root ?? registry.getRoot(),
            'automatic_mission_dispatch_code_root_invalid');
        this.controlRoot = canonicalRoot(options.control_root ?? registry.getRoot(),
            'automatic_mission_dispatch_control_root_invalid');
        this.maxDeadlineMs = options.max_deadline_ms ?? MAX_DEADLINE_MS;
        this.defaultDeadlineMs = options.default_deadline_ms ?? DEFAULT_DEADLINE_MS;
    }

    private db(): Database.Database {
        const db = this.providedDb ?? database.getWritableDb(this.controlRoot);
        if (!this.initialized) {
            db.exec(`
                CREATE TABLE IF NOT EXISTS hall_automatic_mission_dispatch_intents (
                    dispatch_id TEXT PRIMARY KEY,
                    hall_repo_id TEXT NOT NULL,
                    repository_id TEXT NOT NULL,
                    root_path TEXT NOT NULL,
                    source_kind TEXT NOT NULL CHECK(source_kind IN ('automatic_mission','augury')),
                    mission_id TEXT NOT NULL,
                    decision_id TEXT NOT NULL,
                    bead_id TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    intent_sha256 TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN
                        ('queued','claimed','delivered_unverified','validated',
                         'failed','cancelled','expired')),
                    deadline_at INTEGER NOT NULL,
                    receipt_json TEXT NOT NULL,
                    mission_json TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(hall_repo_id, idempotency_key)
                );
                CREATE INDEX IF NOT EXISTS idx_hall_automatic_dispatch_state_deadline
                    ON hall_automatic_mission_dispatch_intents(hall_repo_id, state, deadline_at);
            `);
            this.initialized = true;
        }
        return db;
    }

    private resolveRepository(
        repositoryId?: string,
        rootPath?: string,
    ): { hall_repository_id: string; repository_id: string; root_path: string } {
        if ((repositoryId === undefined) !== (rootPath === undefined)) {
            throw new Error('automatic_mission_dispatch_repository_identity_incomplete');
        }
        const hallId = buildHallRepositoryId(normalizeHallPath(this.controlRoot));
        const targetRoot = rootPath === undefined ? this.codeRoot
            : canonicalRoot(rootPath, 'automatic_mission_dispatch_repository_root_invalid');
        const targetId = buildAutomaticMissionDispatchRepositoryId(targetRoot);
        if (repositoryId !== undefined && repositoryId !== targetId) {
            throw new Error('automatic_mission_dispatch_repository_id_root_mismatch');
        }
        if (targetRoot === this.codeRoot) {
            return { hall_repository_id: hallId, repository_id: targetId, root_path: targetRoot };
        }
        const rows = this.db().prepare(`
            SELECT root_path, mount_status FROM hall_mounted_spokes WHERE repo_id = ?
        `).all(hallId) as Array<{ root_path: string; mount_status: string }>;
        const row = rows.find((item) => {
            try {
                return canonicalRoot(item.root_path,
                    'automatic_mission_dispatch_registered_spoke_root_invalid') === targetRoot;
            } catch {
                return false;
            }
        });
        if (!row) throw new Error('automatic_mission_dispatch_repository_unknown');
        if (row.mount_status !== 'active') {
            throw new Error('automatic_mission_dispatch_repository_inactive');
        }
        return { hall_repository_id: hallId, repository_id: targetId, root_path: targetRoot };
    }

    enqueue(input: EnqueueAutomaticMissionDispatchInput): EnqueueAutomaticMissionDispatchResult {
        const now = input.now ?? Date.now();
        const repository = this.resolveRepository(input.repository_id, input.root_path);
        const db = this.db();
        return db.transaction(() => {
            const existing = db.prepare(`
                SELECT intent_sha256, receipt_json, mission_json
                FROM hall_automatic_mission_dispatch_intents
                WHERE hall_repo_id = ? AND idempotency_key = ?
            `).get(repository.hall_repository_id, input.idempotency_key) as
                { intent_sha256: string; receipt_json: string; mission_json: string | null } | undefined;
            const existingReceipt = existing ? parseReceipt(existing.receipt_json) : undefined;
            if (existingReceipt && input.deadline_at !== undefined
                && input.deadline_at !== existingReceipt.deadline_at) {
                throw new Error('automatic_mission_dispatch_idempotency_conflict');
            }
            const deadline = input.deadline_at ?? existingReceipt?.deadline_at
                ?? now + this.defaultDeadlineMs;
            const intent = {
                source_kind: input.source_kind,
                mission_id: input.mission_id,
                decision_id: input.decision_id,
                bead_id: input.bead_id,
                idempotency_key: input.idempotency_key,
                repository,
                deadline_at: deadline,
                intent_binding: input.intent_binding,
                worker_launch_performed: false,
            } as const;
            const intentHash = sha256(intent);
            if (existing) {
                if (existing.intent_sha256 !== intentHash) {
                    throw new Error('automatic_mission_dispatch_idempotency_conflict');
                }
                return {
                    receipt: existingReceipt!,
                    mission: existing.mission_json
                        ? JSON.parse(existing.mission_json) as AutomaticMissionRecord : undefined,
                    replayed: true,
                };
            }
            if (!Number.isSafeInteger(deadline) || deadline <= now
                || deadline - now > this.maxDeadlineMs) {
                throw new Error('automatic_mission_dispatch_deadline_invalid');
            }
            const dispatchId = `dispatch:cstar:${intentHash.slice(0, 40)}`;
            const receipt = receiptWithHash({
                schema: 'cstar.automatic_mission_dispatch_receipt.v1',
                dispatch_id: dispatchId,
                source_kind: input.source_kind,
                mission_id: input.mission_id,
                decision_id: input.decision_id,
                bead_id: input.bead_id,
                idempotency_key: input.idempotency_key,
                ...repository,
                state: 'queued', created_at: now, updated_at: now, deadline_at: deadline,
                claimed_at: null, claimed_by: null, delivered_at: null, validated_at: null,
                failed_at: null, cancelled_at: null, expired_at: null, detail: null,
                launch_required_by_host: true, worker_launch_performed: false,
            });
            db.prepare(`
                INSERT INTO hall_automatic_mission_dispatch_intents (
                    dispatch_id, hall_repo_id, repository_id, root_path, source_kind,
                    mission_id, decision_id, bead_id, idempotency_key, intent_sha256,
                    state, deadline_at, receipt_json, mission_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(dispatchId, repository.hall_repository_id, repository.repository_id,
                repository.root_path, input.source_kind, input.mission_id, input.decision_id,
                input.bead_id, input.idempotency_key, intentHash, receipt.state, deadline,
                stableJson(receipt), input.mission ? stableJson(input.mission) : null, now, now);
            return { receipt, mission: input.mission, replayed: false };
        }).immediate();
    }

    getByIdempotencyKey(idempotencyKey: string): EnqueueAutomaticMissionDispatchResult | undefined {
        const hallId = buildHallRepositoryId(normalizeHallPath(this.controlRoot));
        const row = this.db().prepare(`
            SELECT receipt_json, mission_json FROM hall_automatic_mission_dispatch_intents
            WHERE hall_repo_id = ? AND idempotency_key = ?
        `).get(hallId, idempotencyKey) as
            { receipt_json: string; mission_json: string | null } | undefined;
        return row ? {
            receipt: parseReceipt(row.receipt_json),
            mission: row.mission_json ? JSON.parse(row.mission_json) as AutomaticMissionRecord : undefined,
            replayed: true,
        } : undefined;
    }

    getByMissionId(missionId: string): EnqueueAutomaticMissionDispatchResult | undefined {
        const hallId = buildHallRepositoryId(normalizeHallPath(this.controlRoot));
        const row = this.db().prepare(`
            SELECT receipt_json, mission_json FROM hall_automatic_mission_dispatch_intents
            WHERE hall_repo_id = ? AND mission_id = ? ORDER BY created_at DESC LIMIT 1
        `).get(hallId, missionId) as
            { receipt_json: string; mission_json: string | null } | undefined;
        return row ? {
            receipt: parseReceipt(row.receipt_json),
            mission: row.mission_json ? JSON.parse(row.mission_json) as AutomaticMissionRecord : undefined,
            replayed: true,
        } : undefined;
    }

    transition(
        dispatchId: string,
        next: AutomaticMissionDispatchState,
        options: { now?: number; claimed_by?: string; detail?: string } = {},
    ): AutomaticMissionDispatchReceipt {
        const now = options.now ?? Date.now();
        const db = this.db();
        return db.transaction(() => {
            const row = db.prepare(`SELECT receipt_json FROM hall_automatic_mission_dispatch_intents
                WHERE dispatch_id = ?`).get(dispatchId) as { receipt_json: string } | undefined;
            if (!row) throw new Error('automatic_mission_dispatch_not_found');
            const current = parseReceipt(row.receipt_json);
            const target = now >= current.deadline_at && !['validated', 'failed', 'cancelled', 'expired']
                .includes(current.state) ? 'expired' : next;
            const allowed: Record<AutomaticMissionDispatchState, AutomaticMissionDispatchState[]> = {
                queued: ['claimed', 'failed', 'cancelled', 'expired'],
                claimed: ['delivered_unverified', 'failed', 'cancelled', 'expired'],
                delivered_unverified: ['validated', 'failed', 'cancelled', 'expired'],
                validated: [], failed: [], cancelled: [], expired: [],
            };
            if (!allowed[current.state].includes(target)) {
                throw new Error('automatic_mission_dispatch_transition_invalid');
            }
            if (target === 'claimed' && (!options.claimed_by
                || !BOUNDED_TEXT.test(options.claimed_by))) {
                throw new Error('automatic_mission_dispatch_claimant_invalid');
            }
            if (options.detail !== undefined && !BOUNDED_TEXT.test(options.detail)) {
                throw new Error('automatic_mission_dispatch_detail_invalid');
            }
            const unsigned = {
                ...current, state: target, updated_at: now,
                claimed_at: target === 'claimed' ? now : current.claimed_at,
                claimed_by: target === 'claimed' ? options.claimed_by! : current.claimed_by,
                delivered_at: target === 'delivered_unverified' ? now : current.delivered_at,
                validated_at: target === 'validated' ? now : current.validated_at,
                failed_at: target === 'failed' ? now : current.failed_at,
                cancelled_at: target === 'cancelled' ? now : current.cancelled_at,
                expired_at: target === 'expired' ? now : current.expired_at,
                detail: options.detail ?? current.detail,
            };
            delete (unsigned as Partial<AutomaticMissionDispatchReceipt>).receipt_sha256;
            const receipt = receiptWithHash(unsigned);
            db.prepare(`UPDATE hall_automatic_mission_dispatch_intents
                SET state = ?, receipt_json = ?, updated_at = ? WHERE dispatch_id = ?`)
                .run(target, stableJson(receipt), now, dispatchId);
            return receipt;
        }).immediate();
    }
}
