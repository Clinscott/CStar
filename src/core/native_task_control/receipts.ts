import { assertAllowedKeys, canonicalJson, hashCanonical } from './canonical.js';
import { normalizePolicy, policyHash } from './policy.js';
import { NATIVE_TASK_CONTROL_ERROR_CODES, NativeTaskControlError } from './errors.js';
import {
    NATIVE_TASK_CONTROL_SCHEMAS,
    isRecord,
    isSha256,
    type NativeCircuitBreaker,
    type NativeControllerLease,
    type NativeGoalGeneration,
    type NativeRoleManifest,
    type NativeRoleSlot,
    type NativeTaskControlEvent,
    type NativeTaskEventKind,
    type NativeSuccessionReceipt,
    type NativeWorkTerminalReceipt,
    type NativeCohortWait,
    type NativePolicy,
} from '../../types/native_task_control.js';

function invalid(message: string, details: Record<string, unknown> = {}): never {
    throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.INVALID_CONTRACT, message, details);
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) invalid(`${name} must be a non-empty string`, { name });
    return value;
}

function generation(value: unknown, name: string, allowZero = false): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) invalid(`${name} must be a generation integer`, { name });
    return value;
}

function digest(value: unknown, name: string, nullable = false): string | null {
    if (nullable && value === null) return null;
    if (!isSha256(value)) invalid(`${name} must be a lowercase SHA-256`, { name });
    return value;
}

function sortUniqueStrings(values: readonly string[], name: string): string[] {
    if (!Array.isArray(values)) invalid(`${name} must be an array`);
    const result = [...values as readonly unknown[]].map((value) => requiredString(value, name)).sort();
    if (new Set(result).size !== result.length) invalid(`${name} contains duplicates`, { name });
    return result;
}

function normalizeSlot(slotInput: NativeRoleSlot): NativeRoleSlot {
    if (!isRecord(slotInput)) invalid('role slot must be an object');
    const slot = slotInput as NativeRoleSlot;
    assertAllowedKeys(slot as unknown as Record<string, unknown>, [
        'role_slot_id', 'role', 'persistent', 'owner', 'allowed_task_kinds', 'replacement_budget', 'policy',
    ], 'role_slot');
    requiredString(slot.role_slot_id, 'role_slot_id');
    if (!['controller', 'worker', 'researcher', 'auditor', 'implementation', 'focused_test', 'independent_validator', 'supervisory_root'].includes(slot.role)) invalid('role is not a supported native role');
    if (typeof slot.persistent !== 'boolean') invalid('persistent must be boolean');
    if (slot.owner !== 'sol' && slot.owner !== 'luna') invalid('owner must be sol or luna');
    if (!Number.isSafeInteger(slot.replacement_budget) || slot.replacement_budget < 0) invalid('replacement_budget must be non-negative');
    return {
        role_slot_id: slot.role_slot_id,
        role: slot.role,
        persistent: slot.persistent,
        owner: slot.owner,
        allowed_task_kinds: sortUniqueStrings(slot.allowed_task_kinds, 'allowed_task_kinds'),
        replacement_budget: slot.replacement_budget,
        policy: normalizePolicy(slot.policy),
    };
}

export function normalizeRoleManifest(input: NativeRoleManifest): NativeRoleManifest {
    if (!isRecord(input)) invalid('role manifest must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'manifest_id', 'root_id', 'bead_id', 'set_id', 'phase_id', 'slots',
        'max_persistent_role_slots', 'max_total_role_slots', 'manifest_sha256',
    ], 'manifest');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.roleManifest) invalid('role manifest schema mismatch');
    for (const key of ['manifest_id', 'root_id', 'bead_id', 'set_id', 'phase_id'] as const) requiredString(input[key], key);
    if (!Array.isArray(input.slots) || input.slots.length === 0) invalid('manifest slots must be non-empty');
    if (!Number.isSafeInteger(input.max_persistent_role_slots) || input.max_persistent_role_slots < 1) invalid('invalid persistent role limit');
    if (!Number.isSafeInteger(input.max_total_role_slots) || input.max_total_role_slots < input.slots.length) invalid('invalid total role limit');
    const slots = input.slots.map(normalizeSlot).sort((left, right) => left.role_slot_id.localeCompare(right.role_slot_id));
    if (new Set(slots.map((slot) => slot.role_slot_id)).size !== slots.length) invalid('manifest has duplicate role slots');
    if (slots.filter((slot) => slot.role === 'controller').length !== 1) invalid('manifest must declare exactly one controller role');
    if (slots.filter((slot) => slot.persistent).length > input.max_persistent_role_slots) invalid('manifest exceeds persistent role limit');
    if (slots.length > input.max_total_role_slots) invalid('manifest exceeds total role limit');
    const normalized: NativeRoleManifest = {
        schema: NATIVE_TASK_CONTROL_SCHEMAS.roleManifest,
        manifest_id: input.manifest_id,
        root_id: input.root_id,
        bead_id: input.bead_id,
        set_id: input.set_id,
        phase_id: input.phase_id,
        slots,
        max_persistent_role_slots: input.max_persistent_role_slots,
        max_total_role_slots: input.max_total_role_slots,
    };
    const actualHash = hashCanonical(normalized);
    if (input.manifest_sha256 !== undefined && input.manifest_sha256 !== actualHash) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.MANIFEST_DRIFT, 'role manifest hash mismatch');
    }
    normalized.manifest_sha256 = actualHash;
    return normalized;
}

export type NativeRoleManifestInput = Omit<NativeRoleManifest, 'schema' | 'manifest_sha256'>;

export function createRoleManifest(input: NativeRoleManifestInput): NativeRoleManifest {
    return normalizeRoleManifest({ schema: NATIVE_TASK_CONTROL_SCHEMAS.roleManifest, ...input });
}

export const createNativeRoleManifest = createRoleManifest;

export function hashRoleManifest(manifest: NativeRoleManifest): string {
    const normalized = normalizeRoleManifest(manifest);
    const { manifest_sha256: _ignored, ...withoutHash } = normalized;
    return hashCanonical(withoutHash);
}

export function canonicalRoleManifestJson(manifest: NativeRoleManifest): string {
    const normalized = normalizeRoleManifest(manifest);
    const { manifest_sha256: _ignored, ...withoutHash } = normalized;
    return canonicalJson(withoutHash);
}

export function normalizeGoalGeneration(input: NativeGoalGeneration): NativeGoalGeneration {
    if (!isRecord(input)) invalid('goal generation must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'goal_id', 'root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item', 'partition',
        'generation', 'goal_sha256', 'work_package_sha256', 'role_manifest_sha256', 'effective_policy_sha256', 'previous_goal_sha256',
    ], 'goal');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.goalGeneration) invalid('goal schema mismatch');
    for (const key of ['goal_id', 'root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item', 'partition'] as const) requiredString(input[key], key);
    generation(input.generation, 'generation');
    digest(input.goal_sha256, 'goal_sha256');
    digest(input.work_package_sha256, 'work_package_sha256');
    digest(input.role_manifest_sha256, 'role_manifest_sha256');
    digest(input.effective_policy_sha256, 'effective_policy_sha256');
    digest(input.previous_goal_sha256, 'previous_goal_sha256', true);
    return { ...input, previous_goal_sha256: input.previous_goal_sha256 };
}

export function hashGoalGeneration(goal: NativeGoalGeneration): string {
    const normalized = normalizeGoalGeneration(goal);
    return hashCanonical(normalized);
}

export interface GoalGenerationInput {
    goal_id: string;
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    partition: string;
    generation: number;
    goal: unknown;
    work_package_sha256: string;
    role_manifest_sha256: string;
    effective_policy_sha256: string;
    previous_goal_sha256?: string | null;
}

export function createGoalGeneration(input: GoalGenerationInput): NativeGoalGeneration {
    return normalizeGoalGeneration({
        schema: NATIVE_TASK_CONTROL_SCHEMAS.goalGeneration,
        goal_id: input.goal_id,
        root_id: input.root_id,
        bead_id: input.bead_id,
        set_id: input.set_id,
        phase_id: input.phase_id,
        logical_item: input.logical_item,
        partition: input.partition,
        generation: input.generation,
        goal_sha256: hashCanonical(input.goal),
        work_package_sha256: input.work_package_sha256,
        role_manifest_sha256: input.role_manifest_sha256,
        effective_policy_sha256: input.effective_policy_sha256,
        previous_goal_sha256: input.previous_goal_sha256 ?? null,
    });
}

export function normalizeControllerLease(input: NativeControllerLease): NativeControllerLease {
    if (!isRecord(input)) invalid('controller lease must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'lease_id', 'root_id', 'goal_id', 'goal_generation', 'controller_generation', 'role_slot_id',
        'occupant_id', 'occupant_generation', 'status', 'lease_sha256', 'previous_lease_sha256',
    ], 'lease');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.controllerLease) invalid('lease schema mismatch');
    for (const key of ['lease_id', 'root_id', 'goal_id', 'role_slot_id', 'occupant_id'] as const) requiredString(input[key], key);
    generation(input.goal_generation, 'goal_generation');
    generation(input.controller_generation, 'controller_generation');
    generation(input.occupant_generation, 'occupant_generation');
    if (!['ACTIVE', 'RETIRED', 'FENCED'].includes(input.status)) invalid('lease status is invalid');
    digest(input.previous_lease_sha256, 'previous_lease_sha256', true);
    const normalized: NativeControllerLease = { ...input };
    const { lease_sha256: _ignored, ...withoutHash } = normalized;
    const actualHash = hashCanonical(withoutHash);
    if (input.lease_sha256 !== undefined && input.lease_sha256 !== actualHash) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.MANIFEST_DRIFT, 'controller lease hash mismatch');
    }
    normalized.lease_sha256 = actualHash;
    return normalized;
}

export interface ControllerLeaseInput extends Omit<NativeControllerLease, 'schema' | 'lease_sha256'> {}

export function createControllerLease(input: ControllerLeaseInput): NativeControllerLease {
    return normalizeControllerLease({ schema: NATIVE_TASK_CONTROL_SCHEMAS.controllerLease, ...input });
}

const EVENT_KEYS = [
    'schema', 'event_id', 'event_kind', 'root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item', 'partition',
    'goal_generation', 'controller_generation', 'occupant_generation', 'role_slot_id', 'occupant_id', 'task_logical_id',
    'task_kind', 'event_sequence', 'previous_event_sha256', 'payload', 'event_sha256',
] as const;

export function normalizeEvent(input: NativeTaskControlEvent): NativeTaskControlEvent {
    if (!isRecord(input)) invalid('task-control event must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, EVENT_KEYS, 'event');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.event) invalid('event schema mismatch');
    for (const key of ['event_id', 'root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item', 'partition', 'role_slot_id', 'occupant_id'] as const) requiredString(input[key], key);
    if (!Array.from<NativeTaskEventKind>([
        'START', 'PROGRESS', 'COMPLETE', 'FAIL', 'BLOCK', 'CANCEL', 'REVOKE', 'CANCEL_ACK', 'REVOKED', 'UNKNOWN',
        'SUCCESSION_PREPARE', 'SUCCESSION_COMMIT', 'REPLACEMENT', 'COHORT_WAIT', 'TIMEOUT', 'RETRY', 'REPLAY',
        'AUTO_CONTINUATION', 'FORGE_INVOCATION',
    ]).includes(input.event_kind)) invalid('event kind is invalid');
    generation(input.goal_generation, 'goal_generation');
    generation(input.controller_generation, 'controller_generation');
    generation(input.occupant_generation, 'occupant_generation');
    if (!Number.isSafeInteger(input.event_sequence) || input.event_sequence <= 0) invalid('event_sequence must be positive');
    digest(input.previous_event_sha256, 'previous_event_sha256', true);
    if (input.task_logical_id !== undefined) requiredString(input.task_logical_id, 'task_logical_id');
    if (input.task_kind !== undefined) requiredString(input.task_kind, 'task_kind');
    if (input.payload !== undefined && !isRecord(input.payload)) invalid('event payload must be an object');
    const normalized: NativeTaskControlEvent = { ...input };
    const { event_sha256: _ignored, ...withoutHash } = normalized;
    const actualHash = hashCanonical(withoutHash);
    if (input.event_sha256 !== undefined && input.event_sha256 !== actualHash) {
        throw new NativeTaskControlError(NATIVE_TASK_CONTROL_ERROR_CODES.REPLAY_CONFLICT, 'event hash mismatch');
    }
    normalized.event_sha256 = actualHash;
    return normalized;
}

export type NativeTaskControlEventInput = Omit<NativeTaskControlEvent, 'schema' | 'event_sha256'>;

export function createTaskControlEvent(input: NativeTaskControlEventInput): NativeTaskControlEvent {
    return normalizeEvent({ schema: NATIVE_TASK_CONTROL_SCHEMAS.event, ...input });
}

export const createNativeTaskControlEvent = createTaskControlEvent;

export function hashEvent(event: NativeTaskControlEvent): string {
    return normalizeEvent(event).event_sha256!;
}

export const hashTaskControlEvent = hashEvent;

export function eventIdentityMatches(state: {
    root_id: string;
    bead_id: string;
    set_id: string;
    phase_id: string;
    logical_item: string;
    partition: string;
    goal_generation: number;
}, event: NativeTaskControlEvent): boolean {
    return state.root_id === event.root_id && state.bead_id === event.bead_id && state.set_id === event.set_id
        && state.phase_id === event.phase_id && state.logical_item === event.logical_item && state.partition === event.partition
        && state.goal_generation === event.goal_generation;
}

export function normalizeCircuitBreaker(input: NativeCircuitBreaker): NativeCircuitBreaker {
    if (!isRecord(input)) invalid('circuit breaker must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'scope_id', 'state', 'reason_code', 'opened_event_sha256', 'threshold',
    ], 'breaker');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.circuitBreaker) invalid('breaker schema mismatch');
    requiredString(input.scope_id, 'scope_id');
    if (input.state !== 'CLOSED' && input.state !== 'OPEN') invalid('breaker state is invalid');
    if (input.reason_code !== null && typeof input.reason_code !== 'string') invalid('breaker reason must be string or null');
    digest(input.opened_event_sha256, 'opened_event_sha256', true);
    if (input.threshold !== 1) invalid('breaker threshold must be one');
    return { ...input };
}

export function createCircuitBreaker(scopeId: string): NativeCircuitBreaker {
    return { schema: NATIVE_TASK_CONTROL_SCHEMAS.circuitBreaker, scope_id: requiredString(scopeId, 'scope_id'), state: 'CLOSED', reason_code: null, opened_event_sha256: null, threshold: 1 };
}

export function normalizeCohortWait(input: NativeCohortWait): NativeCohortWait {
    if (!isRecord(input)) invalid('cohort wait must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'cohort_id', 'root_id', 'goal_generation', 'task_ids', 'timeout_seconds', 'wait_count', 'status',
        'wait_event_sha256', 'terminal_event_sha256',
    ], 'cohort_wait');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.cohortWait) invalid('cohort wait schema mismatch');
    requiredString(input.cohort_id, 'cohort_id');
    requiredString(input.root_id, 'root_id');
    generation(input.goal_generation, 'goal_generation');
    if (!Number.isSafeInteger(input.timeout_seconds) || input.timeout_seconds <= 0) invalid('timeout_seconds must be positive');
    if (input.wait_count !== 1) invalid('cohort wait count must be exactly one');
    if (!['PENDING', 'COMPLETED', 'TIMEOUT', 'FROZEN'].includes(input.status)) invalid('cohort wait status is invalid');
    const normalized: NativeCohortWait = { ...input, task_ids: sortUniqueStrings(input.task_ids, 'task_ids') };
    digest(input.wait_event_sha256, 'wait_event_sha256');
    digest(input.terminal_event_sha256, 'terminal_event_sha256', true);
    return normalized;
}

export type NativeCohortWaitInput = Omit<NativeCohortWait, 'schema'>;

export function createCohortWait(input: NativeCohortWaitInput): NativeCohortWait {
    return normalizeCohortWait({ schema: NATIVE_TASK_CONTROL_SCHEMAS.cohortWait, ...input });
}

export const createNativeCohortWait = createCohortWait;

export function normalizeSuccessionReceipt(input: NativeSuccessionReceipt): NativeSuccessionReceipt {
    if (!isRecord(input)) invalid('succession receipt must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'schema', 'succession_id', 'root_id', 'goal_id', 'goal_generation', 'old_controller_generation',
        'old_occupant_generation', 'new_controller_generation', 'new_occupant_generation', 'old_lease_sha256',
        'successor_role_slot_id', 'successor_occupant_id', 'active_task_ids', 'prepare_event_sha256',
        'commit_event_sha256', 'status',
    ], 'succession');
    if (input.schema !== NATIVE_TASK_CONTROL_SCHEMAS.succession) invalid('succession schema mismatch');
    for (const key of ['succession_id', 'root_id', 'goal_id', 'successor_role_slot_id', 'successor_occupant_id'] as const) requiredString(input[key], key);
    for (const key of ['goal_generation', 'old_controller_generation', 'old_occupant_generation', 'new_controller_generation', 'new_occupant_generation'] as const) generation(input[key], key);
    for (const key of ['old_lease_sha256', 'prepare_event_sha256', 'commit_event_sha256'] as const) digest(input[key], key);
    if (input.new_controller_generation !== input.old_controller_generation + 1 || input.new_occupant_generation !== input.old_occupant_generation + 1) invalid('succession generations must increment exactly once');
    if (!['PREPARED', 'COMMITTED', 'FENCED'].includes(input.status)) invalid('succession status is invalid');
    return { ...input, active_task_ids: sortUniqueStrings(input.active_task_ids, 'active_task_ids') };
}

export type NativeSuccessionReceiptInput = Omit<NativeSuccessionReceipt, 'schema'>;

export function createSuccessionReceipt(input: NativeSuccessionReceiptInput): NativeSuccessionReceipt {
    return normalizeSuccessionReceipt({ schema: NATIVE_TASK_CONTROL_SCHEMAS.succession, ...input });
}

export const createNativeSuccessionReceipt = createSuccessionReceipt;

export function buildTerminalReceipt(input: Omit<NativeWorkTerminalReceipt, 'schema'>): NativeWorkTerminalReceipt {
    if (!isRecord(input)) invalid('terminal receipt must be an object');
    assertAllowedKeys(input as unknown as Record<string, unknown>, [
        'receipt_id', 'root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item', 'goal_generation',
        'controller_generation', 'occupant_generation', 'terminal_kind', 'terminal_event_sha256', 'breaker',
        'protected_effects_fenced', 'accepted',
    ], 'terminal_receipt');
    const receipt: NativeWorkTerminalReceipt = { schema: NATIVE_TASK_CONTROL_SCHEMAS.terminalReceipt, ...input };
    requiredString(receipt.receipt_id, 'receipt_id');
    for (const key of ['root_id', 'bead_id', 'set_id', 'phase_id', 'logical_item'] as const) requiredString(receipt[key], key);
    generation(receipt.goal_generation, 'goal_generation');
    generation(receipt.controller_generation, 'controller_generation');
    generation(receipt.occupant_generation, 'occupant_generation');
    digest(receipt.terminal_event_sha256, 'terminal_event_sha256');
    if (!['COMPLETE', 'CANCEL_ACK', 'REVOKED', 'UNKNOWN', 'TIMEOUT', 'FENCED'].includes(receipt.terminal_kind)) invalid('terminal kind is invalid');
    if (!normalizeCircuitBreaker(receipt.breaker)) invalid('invalid breaker');
    if (typeof receipt.protected_effects_fenced !== 'boolean' || typeof receipt.accepted !== 'boolean') invalid('terminal booleans are invalid');
    return receipt;
}

export const createWorkTerminalReceipt = buildTerminalReceipt;
export const createNativeWorkTerminalReceipt = buildTerminalReceipt;

export function canonicalReceiptJson(value: unknown): string {
    return canonicalJson(value);
}

export function receiptHash(value: unknown): string {
    return hashCanonical(value);
}

export function effectivePolicyHash(policy: NativePolicy): string {
    return policyHash(policy);
}
