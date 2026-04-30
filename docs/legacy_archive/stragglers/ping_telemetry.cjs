const http = require('http');

const data = JSON.stringify({
    agent_id: "ODIN",
    action: "SEARCH",
    target_path: "src/tools/pennyone/index.ts",
    timestamp: Date.now()
});

const options = {
    hostname: 'localhost',
    port: 4000,
    path: '/api/telemetry/ping',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
        console.log(`BODY: ${chunk}`);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
