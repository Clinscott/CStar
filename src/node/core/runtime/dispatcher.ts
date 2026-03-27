import crypto from 'node:crypto';
import { 
    RuntimeContext, 
    WeaveInvocation, 
    WeaveResult, 
    RuntimeAdapter,
    RuntimeDispatchPort,
} from './contracts.ts';
import { StateRegistry } from  '../state.js';
import { activePersona } from  '../../../tools/pennyone/personaRegistry.js';
import { registry } from  '../../../tools/pennyone/pathRegistry.js';
import { getGungnirOverall } from  '../../../types/gungnir.js';
import { resolveEstateTarget } from  './estate_targeting.js';
import { upsertHallBead, getHallBead } from  '../../../tools/pennyone/intel/database.js';
import { buildHallRepositoryId, normalizeHallPath } from  '../../../types/hall.js';

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
    };

    private constructor(deps?: Partial<typeof RuntimeDispatcher.prototype.deps>) {
        this.deps = {
            stateRegistry: deps?.stateRegistry ?? StateRegistry,
            resolveEstateTarget: deps?.resolveEstateTarget ?? resolveEstateTarget,
            activePersona: deps?.activePersona ?? activePersona,
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
        const weaveId = isSkillBead ? invocation.skill_id : invocation.weave_id;
        const payload = isSkillBead ? invocation.params : invocation.payload;
        const target = isSkillBead ? undefined : invocation.target;
        const session = isSkillBead ? undefined : invocation.session;

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

        const context: RuntimeContext = {
            mission_id: `MISSION-${crypto.randomInt(10000, 99999)}`,
            bead_id: (payload as any)?.bead_id || (isSkillBead ? invocation.id : `bead_mission_${Date.now()}`),
            trace_id: crypto.randomUUID(),
            persona: this.deps.activePersona.name,
            workspace_root: estateTarget.workspaceRoot,
            operator_mode: session?.mode ?? 'cli',
            target_domain: estateTarget.targetDomain,
            interactive: session?.interactive ?? true,
            spoke_name: estateTarget.spokeName,
            spoke_root: estateTarget.spokeRoot,
            requested_root: estateTarget.requestedRoot,
            session_id: session?.session_id,
            env: process.env,
            timestamp: Date.now()
        };

        // [🔱] THE TRACE SELECTION GATE: Enforce Trace for CLI operations
        const query = (payload as any)?.query || (payload as any)?.rationale || '';
        const hasTrace = query.includes('// Corvus Star Trace [Ω]');
        const isInternalOS = ['weave:host-governor', 'weave:dynamic-command', 'weave:restoration', 'weave:creation_loop', 'weave:orchestrate'].includes(weaveId);
        const isObservationInvocation = ['weave:status', 'weave:hall', 'weave:vitals', 'weave:manifest'].includes(weaveId)
            || (weaveId === 'weave:pennyone' && ['search', 'stats', 'topology', 'view', 'scan'].includes(String((payload as any)?.action ?? '').trim()));
        
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
            target_path: estateTarget.requestedRoot || null,
            rationale: `Execution of ${weaveId} under mission ${context.mission_id}`,
            status: 'IN_PROGRESS',
            assigned_agent: context.persona === 'O.D.I.N.' ? 'ONE-MIND' : 'ALFRED',
            created_at: Date.now(),
            updated_at: Date.now()
        } as any);

        try {
            // If it's a SkillBead, wrap it into a WeaveInvocation to pass down
            const invocationToPass: WeaveInvocation<any> = isSkillBead 
                ? { weave_id: weaveId, payload: payload, target: target, session: session } 
                : invocation;
            const result = await adapter.execute(invocationToPass, context);
            
            // Sync status if needed
            if (result.status === 'SUCCESS' && result.metrics_delta) {
                this.deps.stateRegistry.updateFramework({ gungnir_score: getGungnirOverall(result.metrics_delta) });
            }

            return result;
        } catch (err: any) {
            return {
                weave_id: weaveId,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "The execution of weave/skill '${weaveId}' has suffered a catastrophic failure: ${err.message}"`
            };
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
}
