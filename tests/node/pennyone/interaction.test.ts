import { runScan } from  '../../../src/tools/pennyone/index.js';
import fs from 'fs/promises';
import path from 'path';
import { registry } from  '../../../src/tools/pennyone/pathRegistry.js';

/**
 * [Ω] Interaction Protocol Verification
 * Purpose: Verify that PennyOne extracts and serves 'How to Interact' metadata.
 */
async function runTest() {
    console.log("◤ TIER 4: INTERACTION PROTOCOL TEST ◢");
    const testDir = path.resolve('./tmp_interaction_test');
    
    try {
        await fs.mkdir(testDir, { recursive: true });
        
        // Edge Case 1: Complex Python Warden
        const pyCode = `
class TestWarden:
    """Represents a neural sentinel."""
    def evaluate(self, graph):
        pass
`;
        await fs.writeFile(path.join(testDir, 'warden.py'), pyCode);

        // Edge Case 2: React Component
        const tsxCode = `
export const NeuralNode = () => {
    return <mesh />;
};
`;
        await fs.writeFile(path.join(testDir, 'Node.tsx'), tsxCode);

        console.log("[PULSE] Running Scan on synthetic sectors...");
        await runScan(testDir);

        const statsDir = path.join(registry.getRoot(), '.stats');
        
        // Verify Python Extraction
        const pyReport = await fs.readFile(path.join(statsDir, 'tmp_interaction_test-warden-py.qmd'), 'utf-8');
        if (pyReport.includes('## Interaction Protocol') && pyReport.includes('Instantiate the Warden class')) {
            console.log("✅ Python Interaction Protocol Verified.");
        } else {
            console.error("❌ Python Interaction Protocol Missing or Invalid.");
            process.exit(1);
        }

        // Verify TSX Extraction
        const tsxReport = await fs.readFile(path.join(statsDir, 'tmp_interaction_test-Node-tsx.qmd'), 'utf-8');
        if (tsxReport.includes('## Interaction Protocol') && tsxReport.includes('Include <Node />')) {
            console.log("✅ TSX Interaction Protocol Verified.");
        } else {
            console.error("❌ TSX Interaction Protocol Missing or Invalid.");
            process.exit(1);
        }

        console.log("◤ INTERACTION GAUNTLET SATISFIED ◢");

    } catch (e: any) {
        console.error(`❌ Test Failure: ${e.message}`);
        process.exit(1);
    } finally {
        await fs.rm(testDir, { recursive: true, force: true });
    }
}

runTest();
