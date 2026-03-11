import { RuntimeDispatcher } from './dispatcher.ts';
import { DynamicCommandAdapter, PennyOneAdapter, RavensAdapter, StartAdapter } from './adapters.ts';
import { ChantWeave } from './weaves/chant.ts';
import { EvolveWeave } from './weaves/evolve.ts';
import { RavensCycleWeave, RavensStageContractAdapter } from './weaves/ravens_cycle.ts';
import { TaliesinForgeWeave } from './weaves/taliesin_forge.ts';

/**
 * [Ω] RUNTIME BOOTSTRAP
 * Purpose: Initialize the canonical dispatcher with built-in weaves and adapters.
 */
export function bootstrapRuntime(dispatcher: RuntimeDispatcher = RuntimeDispatcher.getInstance()): RuntimeDispatcher {
    const adapters = [
        new StartAdapter(),
        new RavensAdapter(),
        new RavensCycleWeave(),
        new RavensStageContractAdapter('memory'),
        new RavensStageContractAdapter('hunt'),
        new RavensStageContractAdapter('validate'),
        new RavensStageContractAdapter('promote'),
        new PennyOneAdapter(),
        new ChantWeave(dispatcher),
        new EvolveWeave(),
        new TaliesinForgeWeave(),
        new DynamicCommandAdapter(),
    ];

    for (const adapter of adapters) {
        if (!dispatcher.hasAdapter(adapter.id)) {
            dispatcher.registerAdapter(adapter);
        }
    }

    return dispatcher;
}
