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
    public async dispatch<T>(invocation: WeaveInvocation<T>): Promise<WeaveResult> {
        const adapter = this.adapters.get(invocation.weave_id);

        if (!adapter) {
            return {
                weave_id: invocation.weave_id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I am unable to resolve the weave '${invocation.weave_id}', sir. The spine remains disconnected for this path."`
            };
        }

        let estateTarget;
        try {
            estateTarget = this.deps.resolveEstateTarget(invocation.target);
        } catch (err: any) {
            return {
                weave_id: invocation.weave_id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "I cannot resolve the requested estate target, sir: ${err.message}"`,
            };
        }

        const context: RuntimeContext = {
            mission_id: `MISSION-${crypto.randomInt(10000, 99999)}`,
            trace_id: crypto.randomUUID(),
            persona: this.deps.activePersona.name,
            workspace_root: estateTarget.workspaceRoot,
            operator_mode: invocation.session?.mode ?? 'cli',
            target_domain: estateTarget.targetDomain,
            interactive: invocation.session?.interactive ?? true,
            spoke_name: estateTarget.spokeName,
            spoke_root: estateTarget.spokeRoot,
            requested_root: estateTarget.requestedRoot,
            session_id: invocation.session?.session_id,
            env: process.env,
            timestamp: Date.now()
        };

        // Update Global State: Mission Identity
        this.deps.stateRegistry.updateMission(context.mission_id, `Executing weave: ${invocation.weave_id}`);

        try {
            const result = await adapter.execute(invocation, context);
            
            // Sync status if needed
            if (result.status === 'SUCCESS' && result.metrics_delta) {
                this.deps.stateRegistry.updateFramework({ gungnir_score: getGungnirOverall(result.metrics_delta) });
            }

            return result;
        } catch (err: any) {
            return {
                weave_id: invocation.weave_id,
                status: 'FAILURE',
                output: '',
                error: `[ALFRED]: "The execution of weave '${invocation.weave_id}' has suffered a catastrophic failure: ${err.message}"`
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
