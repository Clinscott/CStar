export const KERNEL_RUNTIME_GENERATION_SCHEMA = 'cstar.kernel_runtime_generation.v1' as const;
export const KERNEL_RUNTIME_HANDLE_SCHEMA = 'cstar.kernel_runtime_handle.v1' as const;

export type KernelRuntimeGenerationSchema = typeof KERNEL_RUNTIME_GENERATION_SCHEMA;
export type KernelRuntimeHandleSchema = typeof KERNEL_RUNTIME_HANDLE_SCHEMA;

/**
 * The immutable identity a host must carry when it talks to one kernel
 * process.  The fields are intentionally serializable so a host can persist
 * the handle without giving the kernel a second state store.
 */
export interface KernelRuntimeGenerationReceipt {
    schema: KernelRuntimeGenerationSchema;
    code_root: string;
    code_root_identity: string;
    source_fingerprint: string;
    package_fingerprint: string;
    launch_nonce: string;
    generation: number;
    issued_at: number;
}

export interface KernelRuntimeGenerationHandle {
    schema: KernelRuntimeHandleSchema;
    receipt: KernelRuntimeGenerationReceipt;
    expected_generation: number;
}

export interface KernelRuntimeGenerationBinding {
    code_root?: string;
    code_root_identity?: string;
    source_fingerprint?: string;
    package_fingerprint?: string;
    launch_nonce?: string;
    generation?: number;
}

export interface RuntimeGenerationHandshakeRequest {
    code_root: string;
    code_root_identity?: string;
    source_fingerprint: string;
    package_fingerprint: string;
    launch_nonce: string;
    generation?: number;
    expected_receipt?: KernelRuntimeGenerationReceipt;
    issued_at?: number;
}

export interface RuntimeReattachRequest extends KernelRuntimeGenerationBinding {
    current_receipt: KernelRuntimeGenerationReceipt;
    stale_handle?: KernelRuntimeGenerationHandle;
}

/**
 * Replay is deliberately narrower than a generic retry: a caller must prove
 * that no provider request has started and that the operation is idempotent.
 */
export interface ZeroProviderReplay<T> {
    idempotent: boolean;
    provider_attempts: number;
    execute: () => T;
}

export interface RuntimeGenerationMutationBinding {
    expected_generation?: number;
    expected_receipt?: KernelRuntimeGenerationReceipt;
}

export interface RuntimeGenerationReplayResult<T> {
    handle: KernelRuntimeGenerationHandle;
    replayed: boolean;
    value?: T;
}
