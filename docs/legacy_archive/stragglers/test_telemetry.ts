// Use built-in fetch


async function testTelemetry() {
    const url = 'http://localhost:4000/api/telemetry/ping';
    const pings = [
        { agent_id: 'ODIN', action: 'SEARCH', target_path: 'src/tools/pennyone/index.ts', timestamp: Date.now() },
        { agent_id: 'ODIN', action: 'READ', target_path: 'src/tools/pennyone/live/telemetry.ts', timestamp: Date.now() + 1000 },
        { agent_id: 'ODIN', action: 'THINK', target_path: 'src/tools/pennyone/live/recorder.ts', timestamp: Date.now() + 2000 }
    ];

    for (const ping of pings) {
        console.log(`[TEST]: Sending ping for ${ping.target_path}...`);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ping)
        });
        const data = await res.json();
        console.log(`[TEST]: Server Response:`, data);
    }
}

testTelemetry().catch(console.error);
