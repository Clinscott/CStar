import { randomUUID } from 'node:crypto';
import type {
    KernelRuntimeGenerationBinding,
    KernelRuntimeGenerationHandle,
    KernelRuntimeGenerationReceipt,
    RuntimeGenerationHandshakeRequest,
    RuntimeGenerationMutationBinding,
    RuntimeGenerationReplayResult,
    RuntimeReattachRequest,
    ZeroProviderReplay,
} from '../../../types/kernel_runtime_generation.js';
import {
    assertExpectedGeneration,
    assertKernelRuntimeGenerationReceipt,
    assertRuntimeGenerationBinding,
    buildKernelRuntimeGenerationReceipt,
    KernelRuntimeGenerationError,
    RUNTIME_GENERATION_ERROR_CODES,
} from '../contracts/runtime_generation.js';

export interface RuntimeGenerationAuthorityOptions {
    initial_receipt?: KernelRuntimeGenerationReceipt;
    clock?: () => number;
}

export interface RuntimeGenerationHandshakeResult {
    receipt: KernelRuntimeGenerationReceipt;
    handle: KernelRuntimeGenerationHandle;
}

function cloneReceipt(receipt: KernelRuntimeGenerationReceipt): KernelRuntimeGenerationReceipt {
    return { ...receipt };
}

function cloneHandle(handle: KernelRuntimeGenerationHandle): KernelRuntimeGenerationHandle {
    return {
        ...handle,
        receipt: cloneReceipt(handle.receipt),
    };
}

function currentOrThrow(receipt: KernelRuntimeGenerationReceipt | undefined): KernelRuntimeGenerationReceipt {
    if (!receipt) throw new Error('kernel_runtime_generation_uninitialized');
    return receipt;
}

function requestBinding(request: RuntimeGenerationHandshakeRequest): KernelRuntimeGenerationBinding {
    return {
        code_root: request.code_root,
        ...(request.code_root_identity ? { code_root_identity: request.code_root_identity } : {}),
        source_fingerprint: request.source_fingerprint,
        package_fingerprint: request.package_fingerprint,
        launch_nonce: request.launch_nonce,
    };
}

function expectedGenerationFrom(
    expected: number | KernelRuntimeGenerationHandle | RuntimeGenerationMutationBinding | undefined,
): { generation?: number; receipt?: KernelRuntimeGenerationReceipt } {
    if (typeof expected === 'number') return { generation: expected };
    if (!expected) return {};
    if ('receipt' in expected) {
        return { generation: expected.expected_generation, receipt: expected.receipt };
    }
    return {
        generation: expected.expected_generation,
        receipt: expected.expected_receipt,
    };
}

/**
 * Explicit host-owned generation state.  It never reloads modules, starts a
 * process, polls, or writes a durable record; callers must supply the next
 * launch's evidence and decide when to issue it.
 */
export class KernelRuntimeGenerationAuthority {
    private current_receipt?: KernelRuntimeGenerationReceipt;
    private readonly clock: () => number;

    constructor(options: RuntimeGenerationAuthorityOptions = {}) {
        this.clock = options.clock ?? Date.now;
        if (options.initial_receipt) {
            this.current_receipt = assertKernelRuntimeGenerationReceipt(options.initial_receipt);
        }
    }

    current(): KernelRuntimeGenerationReceipt {
        return cloneReceipt(currentOrThrow(this.current_receipt));
    }

    issue(request: RuntimeGenerationHandshakeRequest): KernelRuntimeGenerationReceipt {
        const current = this.current_receipt;
        if (current && request.expected_receipt) {
            assertExpectedGeneration(current, request.expected_receipt.generation);
            assertRuntimeGenerationBinding(current, request.expected_receipt);
        }

        const nextGeneration = current ? current.generation + 1 : (request.generation ?? 1);
        if (request.generation !== undefined && request.generation !== nextGeneration) {
            throw new KernelRuntimeGenerationError(RUNTIME_GENERATION_ERROR_CODES.non_monotonic, {
                expected_generation: nextGeneration,
                requested_generation: request.generation,
            });
        }
        const receipt = buildKernelRuntimeGenerationReceipt({
            ...request,
            generation: nextGeneration,
            issued_at: request.issued_at ?? this.clock(),
        });
        this.current_receipt = receipt;
        return cloneReceipt(receipt);
    }

    handshake(request: RuntimeGenerationHandshakeRequest): RuntimeGenerationHandshakeResult {
        const receipt = this.issue(request);
        return { receipt: cloneReceipt(receipt), handle: this.handle(receipt) };
    }

    handle(receipt: KernelRuntimeGenerationReceipt = this.current()): KernelRuntimeGenerationHandle {
        const validReceipt = assertKernelRuntimeGenerationReceipt(receipt);
        return {
            schema: 'cstar.kernel_runtime_handle.v1',
            receipt: cloneReceipt(validReceipt),
            expected_generation: validReceipt.generation,
        };
    }

    assertFresh(
        expected: number | KernelRuntimeGenerationHandle | RuntimeGenerationMutationBinding | undefined,
    ): void {
        const current = currentOrThrow(this.current_receipt);
        const binding = expectedGenerationFrom(expected);
        assertExpectedGeneration(current, binding.generation);
        if (binding.receipt) assertRuntimeGenerationBinding(current, binding.receipt);
    }

    mutate<T>(
        expected: number | KernelRuntimeGenerationHandle | RuntimeGenerationMutationBinding | undefined,
        mutation: () => T,
    ): T {
        this.assertFresh(expected);
        return mutation();
    }

    reattach(request: RuntimeReattachRequest): KernelRuntimeGenerationHandle {
        return reattachRuntimeGeneration(request);
    }
}

export function createKernelRuntimeGenerationAuthority(
    options: RuntimeGenerationAuthorityOptions = {},
): KernelRuntimeGenerationAuthority {
    return new KernelRuntimeGenerationAuthority(options);
}

export const createRuntimeGenerationHandshake = createKernelRuntimeGenerationAuthority;

export function createLaunchNonce(): string {
    return randomUUID();
}

/** Guard the callback before it can perform a mutation. */
export function guardGenerationBoundMutation<T>(
    current: KernelRuntimeGenerationReceipt,
    expected: number | KernelRuntimeGenerationHandle | RuntimeGenerationMutationBinding | undefined,
    mutation: () => T,
): T {
    const validCurrent = assertKernelRuntimeGenerationReceipt(current);
    const binding = expectedGenerationFrom(expected);
    assertExpectedGeneration(validCurrent, binding.generation);
    if (binding.receipt) assertRuntimeGenerationBinding(validCurrent, binding.receipt);
    return mutation();
}

export const executeGenerationBoundMutation = guardGenerationBoundMutation;

/**
 * Reattach is an explicit, read-only binding operation.  A stale handle is
 * metadata only; source/package evidence for the new process must be supplied
 * again when it is available.
 */
export function reattachRuntimeGeneration(
    request: RuntimeReattachRequest,
): KernelRuntimeGenerationHandle {
    const current = assertKernelRuntimeGenerationReceipt(request.current_receipt);
    const binding: KernelRuntimeGenerationBinding = {
        ...(request.code_root ? { code_root: request.code_root } : {}),
        ...(request.code_root_identity ? { code_root_identity: request.code_root_identity } : {}),
        ...(request.source_fingerprint ? { source_fingerprint: request.source_fingerprint } : {}),
        ...(request.package_fingerprint ? { package_fingerprint: request.package_fingerprint } : {}),
        ...(request.launch_nonce ? { launch_nonce: request.launch_nonce } : {}),
    };
    assertRuntimeGenerationBinding(current, binding);
    return {
        schema: 'cstar.kernel_runtime_handle.v1',
        receipt: cloneReceipt(current),
        expected_generation: current.generation,
    };
}

export function replayZeroProviderWork<T>(work: ZeroProviderReplay<T>): T {
    if (work.idempotent !== true || work.provider_attempts !== 0) {
        throw new KernelRuntimeGenerationError(RUNTIME_GENERATION_ERROR_CODES.replay_forbidden, {
            idempotent: work.idempotent,
            provider_attempts: work.provider_attempts,
        });
    }
    return work.execute();
}

export function reattachAndReplay<T>(
    request: RuntimeReattachRequest,
    work?: ZeroProviderReplay<T>,
): RuntimeGenerationReplayResult<T> {
    const handle = reattachRuntimeGeneration(request);
    if (!work) return { handle, replayed: false };
    return {
        handle,
        replayed: true,
        value: replayZeroProviderWork(work),
    };
}

export function handshakeRuntimeGeneration(
    authority: KernelRuntimeGenerationAuthority,
    request: RuntimeGenerationHandshakeRequest,
): RuntimeGenerationHandshakeResult {
    return authority.handshake({
        ...request,
        ...(request.launch_nonce ? {} : { launch_nonce: createLaunchNonce() }),
    });
}

export { requestBinding };
