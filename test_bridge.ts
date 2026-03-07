import { NeuronBridge } from './.agent/forge_staged/neuron_bridge.ts';
import { SynapticNexus } from './src/node/core/nexus.ts';
import chalk from 'chalk';

async function testBridge() {
    console.log("### 🔱 THE GRAND NEURON TEST\n");
    
    // 1. Initialize Nexus
    SynapticNexus.pulse();

    // 2. Scan the ecosystem
    await NeuronBridge.scanEcosystem();
    NeuronBridge.renderTopography();

    // 3. Probe KeepOS
    const keepOsLore = await NeuronBridge.probeNeuron('KeepOS');
    
    if (keepOsLore) {
        console.log(chalk.green(`\n  [SUCCESS] Sibling Lore Retrieved (Snippet):\n`));
        console.log(chalk.dim(keepOsLore.slice(0, 500) + '...\n'));
    }

    // 4. Update Topography
    NeuronBridge.renderTopography();
    SynapticNexus.materializeDominion();
}

testBridge().catch(console.error);
