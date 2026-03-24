import { RuntimeDispatcher } from  './dispatcher.js';
import { 
    DynamicCommandAdapter, 
    PennyOneAdapter, 
    RavensAdapter, 
    StartAdapter,
    RestorationWeave,
    EstateExpansionWeave,
    VigilanceWeave
} from  './adapters.js';
import { AutoBotWeave } from  './weaves/autobot.js';
import { HostWorkerWeave } from  './weaves/host_worker.js';
import { ChantWeave } from  './weaves/chant.js';
import { EvolveWeave } from  './weaves/evolve.js';
import { RavensCycleWeave, RavensStageContractAdapter } from  './weaves/ravens_cycle.js';
import { TaliesinForgeWeave } from  './weaves/taliesin_forge.js';
import { ResearchWeave } from  './weaves/research.js';
import { CritiqueWeave } from  './weaves/critique.js';
import { ArchitectWeave } from  './weaves/architect.js';
import { DistillWeave } from  './weaves/distill.js';
import { OrchestrateWeave } from  './weaves/orchestrate.js';
import { HostGovernorWeave } from  './weaves/host_governor.js';
import { TemporalLearningWeave } from  './weaves/temporal_learning.js';
import { UniversalAdapter } from './universal_adapter.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';
import fs from 'node:fs';
import { join } from 'node:path';
import { bootstrapEnv } from '../../../../scripts/env_bootstrap.js';

/**
 * [Ω] RUNTIME BOOTSTRAP
 * Purpose: Initialize the canonical dispatcher with built-in weaves and adapters.
 */
export function bootstrapRuntime(dispatcher: RuntimeDispatcher = RuntimeDispatcher.getInstance()): RuntimeDispatcher {
    // Environmental Bootstrap
    bootstrapEnv();

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
        new DistillWeave(),
        new CritiqueWeave(dispatcher),
        new ArchitectWeave(dispatcher),
        new EvolveWeave(),
        new TaliesinForgeWeave(),
        new DynamicCommandAdapter(),
        new OrchestrateWeave(dispatcher),
        new HostGovernorWeave(dispatcher),
        new TemporalLearningWeave(),
        new RestorationWeave(dispatcher),
        new EstateExpansionWeave(dispatcher),
        new VigilanceWeave(dispatcher),
    ];

    for (const adapter of adapters) {
        if (!dispatcher.hasAdapter(adapter.id)) {
            dispatcher.registerAdapter(adapter);
        }
    }

    // Dynamic Discovery: Universal Adapters
    try {
        const root = process.env.CSTAR_PROJECT_ROOT || registry.getRoot();
        const skillRegistryPath = join(root, '.agents', 'skill_registry.json');
        if (fs.existsSync(skillRegistryPath)) {
            const skillRegistry = JSON.parse(fs.readFileSync(skillRegistryPath, 'utf-8'));
            for (const [key, entry] of Object.entries<any>(skillRegistry.entries)) {
                const adapterId = entry.execution?.adapter_id || key;
                if (!dispatcher.hasAdapter(adapterId)) {
                    dispatcher.registerAdapter(new UniversalAdapter(adapterId, entry));
                }
            }
        }
    } catch (err) {
        // Silently continue if registry is unavailable during early bootstrap
    }

    return dispatcher;
}
