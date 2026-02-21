import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../..');

console.log('🔥 [RAGNAROK: BRIDGE] Igniting Daemon/Bridge...');
const bridgeProcess = spawn('python', ['-m', 'src.cstar.core.antigravity_bridge'], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    detached: true
});

// Give the bridge some time to boot
setTimeout(() => {
    console.log('⚡ [RAGNAROK: BRIDGE] Firing JSON Payload at Antigravity Bridge (Port 50052)...');

    const payload = JSON.stringify({
        query: "Respond exactly with: BRIDGE_ACTIVE",
        context: { persona: "ODIN" },
        api_key: process.env.GOOGLE_API_DAEMON_KEY || null
    });

    const startTime = performance.now();

    const client = net.createConnection({ port: 50052, host: '127.0.0.1' }, () => {
        console.log('🔗 [RAGNAROK: BRIDGE] Connected to bridge. Sending payload...');
        client.write(payload);
        client.end(); // Signal EOF
    });

    let data = '';
    client.on('data', (chunk) => {
        data += chunk.toString();
    });

    client.on('end', () => {
        const latency = performance.now() - startTime;
        console.log(`⏱️  [RAGNAROK: BRIDGE] Round-trip latency: ${latency.toFixed(2)}ms`);

        if (data.includes('BRIDGE_ACTIVE') || data.includes('Simulation Mode Active')) {
            console.log('✅ [RAGNAROK: BRIDGE] PASSED. Payload serialized and processed successfully.');
        } else {
            console.error('❌ [RAGNAROK: BRIDGE] FAILED. Unexpected response:', data);
            process.exit(1);
        }
        // Cleanup
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', bridgeProcess.pid]);
        } else {
            process.kill(-bridgeProcess.pid); // Kill process group
        }
        process.exit(0);
    });

    client.on('error', (e) => {
        console.error(`❌ [RAGNAROK: BRIDGE] FAILED. Bridge inaccessible: ${e.message}`);
        if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/T', '/PID', bridgeProcess.pid]);
        } else {
            process.kill(-bridgeProcess.pid);
        }
        process.exit(1);
    });


}, 3000); // 3-second Bridge boot grace period
