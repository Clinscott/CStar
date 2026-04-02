import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    RuntimeAdapter,
    RuntimeDispatchPort,
} from './contracts.ts';
import { requestHostText, type HostTextRequest } from '../../../core/host_intelligence.js';
import {
    buildHostNativeSkillPrompt,
    explainCapabilityHostSupport,
    getCapabilityExecutionMode,
    getCapabilityKernelFallbackPolicy,
    getCapabilityOwnershipModel,
    resolveHostProvider,
} from '../../../core/host_session.js';
import { StateRegistry } from  '../state.js';
import { activePersona } from  '../../../tools/pennyone/personaRegistry.js';
import { registry } from  '../../../tools/pennyone/pathRegistry.js';
import { getGungnirOverall } from  '../../../types/gungnir.js';
import { resolveEstateTarget } from  './estate_targeting.js';
import { upsertHallBead, getHallBead } from  '../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../../types/hall.js';

function resolveSkillAdapterAlias(workspaceRoot: string, skillId: string): string {
    const manifestPath = path.join(workspaceRoot, '.agents', 'skill_registry.json');
    if (!fs.existsSync(manifestPath)) {
        return skillId;
    }

    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { entries?: Record<string, { execution?: { adapter_id?: string } }> };
        const entry = manifest.entries?.[skillId];
        return entry?.execution?.adapter_id?.trim() || skillId;
    } catch {
        return skillId;
    }
}

type HostRecoveryAction = 'retry' | 'replan' | 'abandon';

interface HostRecoveryDecision {
    action?: unknown;
    summary?: unknown;
    operator_message?: unknown;
    recovery_task?: unknown;
}

function buildHostWorkflowKernelExecutionError(capabilityId: string): WeaveResult {
    return {
        weave_id: capabilityId,
        status: 'FAILURE',
        output: '',
        error: `Capability '${capabilityId}' is cataloged as a host-workflow and cannot execute on the Node kernel.`,
        metadata: {
            execution_boundary: 'host-native-required',
            ownership_model: 'host-workflow',
        },
    };
}

function resolveHostEnvelopeTimeoutMs(envName: string, defaultMs: number, env: NodeJS.ProcessEnv = process.env): number {
    const provider = resolveHostProvider(env);
    const defaultForProvider = provider === 'codex' && env.CODEX_SHELL !== '1'
        ? Math.max(defaultMs, 300000)
        : defaultMs;
    const raw = Number(env[envName] ?? env.CSTAR_HOST_SESSION_TIMEOUT_MS ?? env.CORVUS_HOST_SESSION_TIMEOUT_MS ?? defaultForProvider);
    return Number.isFinite(raw) && raw > 0 ? raw : defaultForProvider;
}

function extractJsonObject(raw: string): Record<string, unknown> {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        throw new Error('Host recovery did not return a JSON object.');
    }
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeHostRecoveryAction(value: unknown): HostRecoveryAction {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'retry') {
        return 'retry';
    }
    if (normalized === 'replan') {
        return 'replan';
    }
    return 'abandon';
}

function buildKernelRecoveryPrompt(input: {
    weaveId: string;
    skillId?: string;
    workspaceRoot: string;
    error: string;
    payload: unknown;
    context: RuntimeContext;
}): string {
    return [
        'You are supervising a failed CStar kernel execution.',
        'Decide the next bounded recovery action and return strict JSON only.',
        'Allowed actions: retry, replan, abandon.',
        'Choose retry only for transient or obviously recoverable execution faults.',
        'Choose replan when the failure implies the current bead or execution route is wrong.',
        'Choose abandon when no safe automatic correction is justified.',
        'Format:',
        '{ "action": "retry|replan|abandon", "summary": "...", "operator_message": "...", "recovery_task": "..." }',
        '',
        `WEAVE_ID: ${input.weaveId}`,
        input.skillId ? `SKILL_ID: ${input.skillId}` : '',
        `WORKSPACE_ROOT: ${input.workspaceRoot}`,
        `MISSION_ID: ${input.context.mission_id}`,
        `TRACE_ID: ${input.context.trace_id}`,
        `ERROR: ${input.error}`,
        'PAYLOAD:',
        JSON.stringify(input.payload ?? {}, null, 2),
    ].filter(Boolean).join('\n');
}

/**
 * [Ω] THE CANONICAL RUNTIME DISPATCHER (v1.0)
 * Purpose: The singular authority for command and skill execution.
 * Mandate: "One mind, one spine."
 */
export class RuntimeDispatcher implements RuntimeDispatchPort {
    private static instance: RuntimeDispatcher;
    private adapters: Map<string, RuntimeAdapter> = new Map();

    private deps: {
        stateRegistry: typeof StateRegistry;
        resolveEstateTarget: typeof resolveEstateTarget;
        activePersona: typeof activePersona;
        hostTextInvoker: (request: HostTextRequest) => Promise<{ provider: 'gemini' | 'codex' | 'claude'; text: string }>;
    };

    private constructor(deps?: Partial<typeof RuntimeDispatcher.prototype.deps>) {
        this.deps = {
            stateRegistry: deps?.stateRegistry ?? StateRegistry,
            resolveEstateTarget: deps?.resolveEstateTarget ?? resolveEstateTarget,
            activePersona: deps?.activePersona ?? activePersona,
            hostTextInvoker: deps?.hostTextInvoker ?? requestHostText,
        };
    }

    public static getInstance(): RuntimeDispatcher {
        if (!this.instance) {
            this.instance = new RuntimeDispatcher();
        }
        return this.instance;
    }

    public static createIsolated(deps?: Partial<typeof RuntimeDispatcher.prototype.deps>): RuntimeDispatcher {
        return new RuntimeDispatcher(deps);
    }

    /**
     * Registers an adapter for a specific weave/command path.
     */
    public registerAdapter(adapter: RuntimeAdapter): void {
        this.adapters.set(adapter.id, adapter);
    }

    /**
     * [🔱] THE SUPREME DISPATCH
     * The authoritative entrypoint for all high-level framework operations.
     */
    public async dispatch<T>(invocation: WeaveInvocation<T> | import('../skills/types.js').SkillBead<T>): Promise<WeaveResult> {
        const isSkillBead = 'skill_id' in invocation;
        const workspaceRoot = process.env.CSTAR_PROJECT_ROOT || registry.getRoot();
        const weaveId = isSkillBead
            ? resolveSkillAdapterAlias(workspaceRoot, invocation.skill_id)
            : invocation.weave_id;
        const payload = isSkillBead ? invocation.params : invocation.payload;
        const target = isSkillBead ? undefined : invocation.target;
        const session = isSkillBead ? undefined : invocation.session;
        const ownershipCapabilityId = isSkillBead ? invocation.skill_id : weaveId;
        const ownershipModel = getCapabilityOwnershipModel(workspaceRoot, ownershipCapabilityId);
        const kernelFallbackPolicy = getCapabilityKernelFallbackPolicy(workspaceRoot, ownershipCapabilityId);

        if (isSkillBead) {
            const nativeHostResult = await this.tryExecuteSkillBeadViaHostSession(invocation, workspaceRoot);
            if (nativeHostResult) {
                return nativeHostResult;
            }
        }

        if (ownershipModel === 'host-workflow' && kernelFallbackPolicy === 'forbidden') {
            return buildHostWorkflowKernelExecutionError(isSkillBead ? invocation.skill_id : weaveId);
        }

        const adapter = this.adapters.get(weaveId);

        if (!adapter) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I am unable to resolve the weave/skill '${weaveId}', sir. The spine remains disconnected for this path."`
            };
        }

        let estateTarget;
        try {
            estateTarget = this.deps.resolveEstateTarget(target);
        } catch (err: any) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I cannot resolve the requested estate target, sir: ${err.message}"`,
            };
        }

        registry.setRoot(estateTarget.workspaceRoot);

        const context: RuntimeContext = {
            mission_id: `MISSION-${crypto.randomInt(10000, 99999)}`,
            bead_id: (payload as any)?.bead_id || (isSkillBead ? invocation.id : `bead_mission_${Date.now()}`),
            trace_id: crypto.randomUUID(),
            persona: this.deps.activePersona.name,
            workspace_root: estateTarget.workspaceRoot,
            operator_mode: isSkillBead ? 'subkernel' : session?.mode ?? 'cli',
            target_domain: estateTarget.targetDomain,
            interactive: isSkillBead ? false : session?.interactive ?? true,
            spoke_name: estateTarget.spokeName,
            spoke_root: estateTarget.spokeRoot,
            requested_root: estateTarget.requestedRoot,
            session_id: isSkillBead ? undefined : session?.session_id,
            env: process.env,
            timestamp: Date.now()
        };

        // [🔱] THE TRACE SELECTION GATE: Enforce Trace for CLI operations
        const query = (payload as any)?.query || (payload as any)?.rationale || '';
        const hasTrace = query.includes('// Corvus Star Trace [Ω]');
        const isInternalOS = ['weave:start', 'weave:host-governor', 'weave:dynamic-command', 'weave:restoration', 'weave:creation_loop', 'weave:orchestrate'].includes(weaveId);
        const isObservationInvocation = ['weave:status', 'weave:hall', 'weave:vitals', 'weave:manifest'].includes(weaveId)
            || (weaveId === 'weave:pennyone' && ['search', 'stats', 'topology', 'view', 'scan', 'refresh_intents', 'normalize', 'report', 'artifacts', 'status'].includes(String((payload as any)?.action ?? '').trim()));
        
        if (context.operator_mode === 'cli' && !isInternalOS && weaveId !== 'weave:chant' && !hasTrace) {
             // Only enforce on primary entry points (chant, skills, etc.)
             // status, hall, and pennyone observation paths are allowed for observation.
             if (isObservationInvocation) {
                 // Allowed observation
             } else {
                return {
                    weave_id: weaveId,
                    status: 'FAILURE',
                    output: '',
                    error: `[KERNEL PANIC]: Trace Selection Gate Breach. The command '${weaveId}' MUST begin with the '// Corvus Star Trace [Ω]' block.`
                };
             }
        }
        
        // If it's a chant call, it MUST have the trace.
        if (weaveId === 'weave:chant' && context.operator_mode === 'cli' && !hasTrace) {
             return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[KERNEL PANIC]: Trace Selection Gate Breach. All Planning sessions (chant) MUST begin with the '// Corvus Star Trace [Ω]' block.`
            };
        }

        // [🔱] THE BEAD-DRIVEN MANDATE: Ensure the Hall tracks the Engine
        const repoId = buildHallRepositoryId(normalizeHallPath(context.workspace_root));
        const existingBead = getHallBead(context.bead_id);
        
        if (!existingBead) {
            // Strike a new Parent Mission Bead if it doesn't exist
            upsertHallBead({
                bead_id: context.bead_id,
                repo_id: repoId,
                target_kind: 'SYSTEM',
                target_ref: weaveId,
                target_path: estateTarget.requestedRoot || null,
                rationale: `Mission execution: ${weaveId}`,
                status: 'OPEN',
                source_kind: 'SYSTEM',
                created_at: Date.now(),
                updated_at: Date.now()
            } as any);
        }

        // Update Global State: Mission Identity
        this.deps.stateRegistry.updateMission(context.mission_id, `Executing weave/skill: ${weaveId}`, context.bead_id);

        // [🔱] THE FRACTAL STRIKE: Create a Child Bead for this specific execution
        const childBeadId = `${context.bead_id}:exec:${weaveId}:${Date.now()}`;
        upsertHallBead({
            bead_id: childBeadId,
            repo_id: repoId,
            target_kind: isSkillBead ? 'SKILL' : 'WEAVE',
            target_ref: weaveId,
            target_path: isSkillBead ? invocation.target_path : estateTarget.requestedRoot || null,
            rationale: `Execution of ${weaveId} under mission ${context.mission_id}`,
            status: 'IN_PROGRESS',
            assigned_agent: context.persona === 'O.D.I.N.' ? 'ONE-MIND' : 'ALFRED',
            created_at: Date.now(),
            updated_at: Date.now()
        } as any);

        try {
            // If it's a SkillBead, wrap it into a WeaveInvocation to pass down
            const invocationToPass: WeaveInvocation<any> = isSkillBead 
                ? {
                    weave_id: weaveId,
                    payload: payload,
                    target: target,
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                } 
                : invocation;
            const result = await adapter.execute(invocationToPass, context);
            
            // Sync status if needed
            if (result.status === 'SUCCESS' && result.metrics_delta) {
                this.deps.stateRegistry.updateFramework({ gungnir_score: getGungnirOverall(result.metrics_delta) });
            }

            if (result.status === 'FAILURE') {
                const recovered = await this.tryRecoverKernelFailure({
                    adapter,
                    invocationToPass,
                    context,
                    workspaceRoot: estateTarget.workspaceRoot,
                    weaveId,
                    payload,
                    initialResult: result,
                    skillId: isSkillBead ? invocation.skill_id : undefined,
                });
                if (recovered) {
                    return recovered;
                }
            }

            return result;
        } catch (err: any) {
            const failureResult: WeaveResult = {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "The execution of weave/skill '${weaveId}' has suffered a catastrophic failure: ${err.message}"`
            };
            const invocationToPass: WeaveInvocation<any> = isSkillBead
                ? {
                    weave_id: weaveId,
                    payload: payload,
                    target: target,
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                }
                : invocation;
            const recovered = await this.tryRecoverKernelFailure({
                adapter,
                invocationToPass,
                context,
                workspaceRoot: estateTarget.workspaceRoot,
                weaveId,
                payload,
                initialResult: failureResult,
                skillId: isSkillBead ? invocation.skill_id : undefined,
            });
            if (recovered) {
                return recovered;
            }
            return failureResult;
        }
    }

    public hasAdapter(id: string): boolean {
        return this.adapters.has(id);
    }

    public listAdapterIds(): string[] {
        return Array.from(this.adapters.keys()).sort();
    }

    /**
     * Triggers the shutdown hook for all registered adapters.
     */
    public async shutdown(): Promise<void> {
        const tasks = Array.from(this.adapters.values())
            .filter(a => typeof a.shutdown === 'function')
            .map(a => a.shutdown!());
        await Promise.all(tasks);
    }

    public clearAdapters(): void {
        this.adapters.clear();
    }

    private async tryRecoverKernelFailure(args: {
        adapter: RuntimeAdapter;
        invocationToPass: WeaveInvocation<any>;
        context: RuntimeContext;
        workspaceRoot: string;
        weaveId: string;
        payload: unknown;
        initialResult: WeaveResult;
        skillId?: string;
    }): Promise<WeaveResult | null> {
        const { adapter, invocationToPass, context, workspaceRoot, weaveId, payload, initialResult, skillId } = args;
        if (weaveId === 'weave:host-governor') {
            return null;
        }

        const ownershipCapabilityId = skillId ?? weaveId;
        const ownershipModel = getCapabilityOwnershipModel(workspaceRoot, ownershipCapabilityId);
        if (ownershipModel !== 'kernel-primitive') {
            return null;
        }

        const executionMode = getCapabilityExecutionMode(workspaceRoot, ownershipCapabilityId);
        if (executionMode !== 'kernel-backed') {
            return null;
        }

        const provider = resolveHostProvider({ ...process.env, ...context.env } as NodeJS.ProcessEnv);
        if (!provider) {
            return null;
        }

        try {
            const hostResponse = await this.deps.hostTextInvoker({
                prompt: buildKernelRecoveryPrompt({
                    weaveId,
                    skillId,
                    workspaceRoot,
                    error: initialResult.error ?? 'Unknown kernel failure.',
                    payload,
                    context,
                }),
                projectRoot: workspaceRoot,
                source: `runtime:recovery:${weaveId}`,
                provider,
                env: { ...process.env, ...context.env } as NodeJS.ProcessEnv,
                metadata: {
                    transport_mode: 'host_session',
                    one_mind_boundary: 'primary',
                    execution_mode: 'kernel-recovery',
                    failed_weave_id: weaveId,
                    failed_skill_id: skillId ?? null,
                },
            });
            const decision = extractJsonObject(hostResponse.text) as HostRecoveryDecision;
            const action = normalizeHostRecoveryAction(decision.action);
            const summary = typeof decision.summary === 'string' ? decision.summary.trim() : '';
            const operatorMessage = typeof decision.operator_message === 'string' ? decision.operator_message.trim() : '';
            const recoveryTask = typeof decision.recovery_task === 'string' ? decision.recovery_task.trim() : '';

            if (action === 'retry') {
                const retryResult = await adapter.execute(invocationToPass, context);
                return {
                    ...retryResult,
                    metadata: {
                        ...(retryResult.metadata ?? {}),
                        host_recovery: {
                            action,
                            provider,
                            summary,
                            operator_message: operatorMessage,
                            attempted: true,
                            succeeded: retryResult.status !== 'FAILURE',
                        },
                    },
                };
            }

            if (action === 'replan') {
                const governorResult = await this.dispatch({
                    weave_id: 'weave:host-governor',
                    payload: {
                        task: recoveryTask || operatorMessage || summary || `Recover from failed kernel execution: ${weaveId}`,
                        auto_execute: true,
                        auto_replan_blocked: true,
                        max_parallel: 1,
                        project_root: workspaceRoot,
                        cwd: workspaceRoot,
                        source: 'runtime',
                    },
                    session: {
                        mode: 'subkernel',
                        interactive: false,
                        session_id: context.session_id,
                    },
                });
                return {
                    ...governorResult,
                    metadata: {
                        ...(governorResult.metadata ?? {}),
                        host_recovery: {
                            action,
                            provider,
                            summary,
                            operator_message: operatorMessage,
                            attempted: true,
                            failed_weave_id: weaveId,
                            failed_skill_id: skillId ?? null,
                        },
                    },
                };
            }

            return {
                ...initialResult,
                metadata: {
                    ...(initialResult.metadata ?? {}),
                    host_recovery: {
                        action,
                        provider,
                        summary,
                        operator_message: operatorMessage,
                        attempted: true,
                        failed_weave_id: weaveId,
                        failed_skill_id: skillId ?? null,
                    },
                },
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                ...initialResult,
                metadata: {
                    ...(initialResult.metadata ?? {}),
                    host_recovery: {
                        action: 'abandon',
                        provider,
                        attempted: true,
                        failed_weave_id: weaveId,
                        failed_skill_id: skillId ?? null,
                        recovery_error: message,
                    },
                },
            };
        }
    }

    private async tryExecuteSkillBeadViaHostSession<T>(
        invocation: import('../skills/types.js').SkillBead<T>,
        workspaceRoot: string,
    ): Promise<WeaveResult | null> {
        const executionMode = getCapabilityExecutionMode(workspaceRoot, invocation.skill_id);
        if (executionMode !== 'agent-native') {
            return null;
        }

        const kernelFallbackPolicy = getCapabilityKernelFallbackPolicy(workspaceRoot, invocation.skill_id);
        const fallbackAdapterId = resolveSkillAdapterAlias(workspaceRoot, invocation.skill_id);
        const canFallbackToKernel = kernelFallbackPolicy !== 'forbidden'
            && (fallbackAdapterId !== invocation.skill_id || this.adapters.has(invocation.skill_id));

        const provider = resolveHostProvider(process.env);
        if (!provider) {
            if (kernelFallbackPolicy === 'forbidden') {
                return {
                    weave_id: invocation.skill_id,
                    status: 'FAILURE',
                    output: '',
                    error: `Skill '${invocation.skill_id}' requires an active host session and forbids kernel fallback.`,
                    metadata: {
                        adapter: 'host-session:agent-native-skill',
                        execution_mode: executionMode,
                        kernel_fallback_policy: kernelFallbackPolicy,
                    },
                };
            }
            return null;
        }

        const hostSupportError = explainCapabilityHostSupport(workspaceRoot, invocation.skill_id, provider);
        if (hostSupportError) {
            return {
                weave_id: invocation.skill_id,
                status: 'FAILURE',
                output: '',
                error: hostSupportError,
            };
        }

        const activationPayload = invocation.params && typeof invocation.params === 'object' && !Array.isArray(invocation.params)
            ? invocation.params as Record<string, unknown>
            : { value: invocation.params };
        const targetPaths = Array.from(new Set([
            String(invocation.target_path ?? '').trim(),
            ...Object.values(activationPayload)
                .filter((value): value is string => typeof value === 'string')
                .filter((value) => /[\\/]|\.([a-z0-9]+)$/i.test(value)),
        ].filter(Boolean)));
        const timeoutMs = resolveHostEnvelopeTimeoutMs('CSTAR_HOST_SKILL_TIMEOUT_MS', 20000);

        try {
            const prompt = buildHostNativeSkillPrompt({
                skill_id: invocation.skill_id,
                intent: invocation.intent,
                project_root: workspaceRoot,
                target_paths: targetPaths,
                payload: activationPayload,
            });
            let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
            try {
                const result = await Promise.race([
                    this.deps.hostTextInvoker({
                        prompt,
                        projectRoot: workspaceRoot,
                        source: `runtime:skill:${invocation.skill_id}`,
                        provider,
                        env: process.env,
                        metadata: {
                            transport_mode: 'host_session',
                            one_mind_boundary: 'primary',
                            execution_mode: 'agent-native',
                            skill_id: invocation.skill_id,
                        },
                    }),
                    new Promise<never>((_, reject) => {
                        timeoutHandle = setTimeout(() => reject(new Error(`host-session timeout after ${timeoutMs}ms`)), timeoutMs);
                    }),
                ]);

                return {
                    weave_id: invocation.skill_id,
                    status: 'SUCCESS',
                    output: result.text,
                    metadata: {
                        adapter: 'host-session:agent-native-skill',
                        execution_mode: executionMode,
                        provider: result.provider,
                        kernel_fallback_policy: kernelFallbackPolicy,
                        target_paths: targetPaths,
                    },
                };
            } finally {
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (canFallbackToKernel) {
                return null;
            }
            return {
                weave_id: invocation.skill_id,
                status: 'FAILURE',
                output: '',
                error: `Host-native skill activation failed for '${invocation.skill_id}': ${message}`,
                metadata: {
                    adapter: 'host-session:agent-native-skill',
                    execution_mode: executionMode,
                    kernel_fallback_policy: kernelFallbackPolicy,
                    target_paths: targetPaths,
                },
            };
        }
    }
}
