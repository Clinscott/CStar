import { RuntimeDispatcher } from './dispatcher.ts';
import { DynamicCommandAdapter, PennyOneAdapter, RavensAdapter, StartAdapter } from './adapters.ts';
import { AutoBotWeave } from './weaves/autobot.ts';
import { HostWorkerWeave } from './weaves/host_worker.ts';
import { ChantWeave } from './weaves/chant.ts';
import { EvolveWeave } from './weaves/evolve.ts';
import { RavensCycleWeave, RavensStageContractAdapter } from './weaves/ravens_cycle.ts';
import { TaliesinForgeWeave } from './weaves/taliesin_forge.ts';
import { ResearchWeave } from './weaves/research.ts';
import { CritiqueWeave } from './weaves/critique.ts';
import { ArchitectWeave } from './weaves/architect.ts';
import { CompressWeave } from './weaves/compress.ts';
import { OrchestrateWeave } from './weaves/orchestrate.ts';
import { HostGovernorWeave } from './weaves/host_governor.ts';
import { TemporalLearningWeave } from './weaves/temporal_learning.ts';

/**
 * [Ω] RUNTIME BOOTSTRAP
 * Purpose: Initialize the canonical dispatcher with built-in weaves and adapters.
 */
export function bootstrapRuntime(dispatcher: RuntimeDispatcher = RuntimeDispatcher.getInstance()): RuntimeDispatcher {
    const adapters = [
        new StartAdapter(dispatcher),
        new RavensAdapter(),
        new RavensCycleWeave(),
        new RavensStageContractAdapter('memory'),
        new RavensStageContractAdapter('hunt'),
        new RavensStageContractAdapter('validate'),
        new RavensStageContractAdapter('promote'),
        new PennyOneAdapter(),
        new AutoBotWeave(),
        new HostWorkerWeave(),
        new ChantWeave(dispatcher),
        new ResearchWeave(dispatcher),
        new CompressWeave(),
        new CritiqueWeave(dispatcher),
        new ArchitectWeave(dispatcher),
        new EvolveWeave(),
        new TaliesinForgeWeave(),
        new DynamicCommandAdapter(),
        new OrchestrateWeave(dispatcher),
        new HostGovernorWeave(dispatcher),
        new TemporalLearningWeave(),
    ];

    for (const adapter of adapters) {
        if (!dispatcher.hasAdapter(adapter.id)) {
            dispatcher.registerAdapter(adapter);
        }
    }

    return dispatcher;
}
