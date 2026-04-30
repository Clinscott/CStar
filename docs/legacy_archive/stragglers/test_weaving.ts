import { AstralWeaver } from './.agents/forge_staged/astral_weaver.ts';
import { SynapticNexus } from './src/node/core/nexus.ts';

async function weaveSimulation() {
    console.log("### 🔱 THE ASTRAL WEAVING RITUAL\n");
    
    // 1. Prepare Canvas (Dependencies check)
    await AstralWeaver.prepareCanvas();

    // 2. Forge Treasury (Funds, Food, Time)
    await AstralWeaver.forgeTreasury();

    // 3. Map Sanctuary (3D Geometry)
    await AstralWeaver.mapSanctuary();

    SynapticNexus.materializeDominion();
}

weaveSimulation().catch(console.error);
