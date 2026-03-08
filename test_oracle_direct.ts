import { CortexLink } from './src/node/cortex_link.js';
import { WebSocket } from 'ws';

async function testOracle() {
    console.log("--- Testing Oracle via Synaptic Link (Daemon) ---");
    const cortex = new CortexLink(50051, '127.0.0.1', WebSocket);
    try {
        const query = "Explain the purpose of the AntigravityUplink module.";
        console.log(`Sending query: ${query}`);
        const response = await cortex.sendCommand('ask', [query, 'BATCH_ANALYSIS']);
        console.log("Response received:");
        console.log(JSON.stringify(response, null, 2));
    } catch (err) {
        console.error("Oracle test FAILED:");
        console.error(err.message);
    }
}

testOracle();
