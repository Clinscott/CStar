import { SovereignLoop } from './src/node/core/heartbeat.ts';
import { SynapticNexus } from './src/node/core/nexus.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

async function testLoop() {
    console.log("### 🔱 SOVEREIGN HEARTBEAT TEST\n");
    
    // 1. Start the loop
    SovereignLoop.initiate();
    
    // 2. Wait a moment then simulate a new chant being dropped
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const testChantPath = path.join(process.cwd(), '.agent/lore/TEST_CHANT.qmd');
    console.log(`\n[!] Dropping test chant: TEST_CHANT.qmd`);
    
    await fs.writeFile(testChantPath, "# TEST CHANT\nMaterialize a simple test file.", 'utf-8');
    
    // 3. Wait for the watch cycle to detect it
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 4. Cleanup and Stop
    console.log("\n[!] Cleaning up test chant...");
    await fs.unlink(testChantPath);
    
    SovereignLoop.stop();
    SynapticNexus.materializeDominion();
    
    process.exit(0);
}

testLoop().catch(console.error);
