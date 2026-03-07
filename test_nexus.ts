import { SynapticNexus } from './src/node/core/nexus.ts';
import { HUD } from './src/node/core/hud.ts';

async function testNexus() {
    console.log("### 🔱 SOVEREIGN NEXUS PULSE TEST\n");
    
    // 1. Initial Pulse
    SynapticNexus.pulse();
    
    // 2. Record Intents
    SynapticNexus.recordIntent("Materializing the Synaptic Nexus.");
    SynapticNexus.recordIntent("Synchronizing the Bifrost Bridge.");
    SynapticNexus.recordIntent("Bending the spoon.");
    
    // 3. Render Dominion View
    SynapticNexus.materializeDominion();
    
    // 4. Simulate a drop in stability
    console.log("\n[!] Simulating Synaptic Strain...");
    SynapticNexus.pulse(-25);
    SynapticNexus.materializeDominion();
}

testNexus().catch(console.error);
