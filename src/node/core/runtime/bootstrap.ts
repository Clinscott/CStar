import { RuntimeDispatcher } from  './dispatcher.js';
import { 
    DynamicCommandAdapter, 
    PennyOneAdapter, 
    RavensAdapter, 
    StartAdapter,
    RestorationHostWorkflow,
    EstateExpansionHostWorkflow,
    VigilanceHostWorkflow
} from  './adapters.js';
import { AutoBotWeave } from  './weaves/autobot.js';
import { HostWorkerWeave } from  './weaves/host_worker.js';
import { ChantHostWorkflow } from  './host_workflows/chant.js';
import { EvolveWeave } from  './weaves/evolve.js';
import { RavensCycleWeave, RavensStageContractAdapter } from  './weaves/ravens_cycle.js';
import { ArtifactForgeHostWorkflow } from  './host_workflows/artifact_forge.js';
import { TaliesinForgeHostWorkflow } from  './host_workflows/taliesin_forge.js';
import { ResearchHostWorkflow } from  './host_workflows/research.js';
import { CritiqueHostWorkflow } from  './host_workflows/critique.js';
import { ArchitectCompatibilityAdapter } from  './compat/architect.js';
import { DistillWeave } from  './weaves/distill.js';
import { OrchestrateWeave } from  './weaves/orchestrate.js';
import { HostGovernorWeave } from  './weaves/host_governor.js';
import { TemporalLearningWeave } from  './weaves/temporal_learning.js';
import { WardenWeave } from './weaves/warden.js';
import { UniversalAdapter } from './universal_adapter.js';
import { registry } from '../../../tools/pennyone/pathRegistry.js';
import fs from 'node:fs';
import { join } from 'node:path';
import { bootstrapEnv } from '../../../../scripts/env_bootstrap.js';

/**
 * [Ω] RUNTIME BOOTSTRAP
 * Purpose: Initialize the canonical kernel dispatcher with bounded adapters and registry-backed workflow records.
 */
export function bootstrapRuntime(dispatcher: RuntimeDispatcher = RuntimeDispatcher.getInstance()): RuntimeDispatcher {
    // Environmental Bootstrap
    bootstrapEnv();

    // These adapters are kernel-visible records and bounded primitives.
    // Many expose host-native skills/weaves above the kernel rather than Node-owned cognition.
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
        new ChantHostWorkflow(dispatcher),
        new ResearchHostWorkflow(dispatcher),
        new DistillWeave(),
        new CritiqueHostWorkflow(dispatcher),
        new ArchitectCompatibilityAdapter(dispatcher),
        new EvolveWeave(),
        new ArtifactForgeHostWorkflow(),
        new TaliesinForgeHostWorkflow(),
        new DynamicCommandAdapter(),
        new OrchestrateWeave(dispatcher),
        new HostGovernorWeave(dispatcher),
        new TemporalLearningWeave(),
        new RestorationHostWorkflow(dispatcher),
        new EstateExpansionHostWorkflow(dispatcher),
        new WardenWeave(dispatcher),
        new VigilanceHostWorkflow(dispatcher),
    ];

    for (const adapter of adapters) {
        if (!dispatcher.hasAdapter(adapter.id)) {
            dispatcher.registerAdapter(adapter);
        }
    }

    // Dynamic Discovery: registry-backed adapter records for host-native capabilities and bounded primitives.
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
