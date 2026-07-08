import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const MCP_LAUNCHER = path.join(ROOT, 'bin', 'cstar-kernel-mcp.js');

const PORT = Number.parseInt(process.env.CSTAR_KERNEL_MCP_TCP_PORT ?? '8000', 10);
const HOST = process.env.CSTAR_KERNEL_MCP_TCP_HOST ?? '127.0.0.1';

const server = net.createServer((socket) => {
    console.log(`[${new Date().toISOString()}] [daemon] client connected`);

    // Spawn the stdio MCP server process
    const child = spawn('node', [MCP_LAUNCHER], {
        cwd: ROOT,
        env: {
            ...process.env,
            CSTAR_KERNEL_MCP: '1',
            CSTAR_KERNEL_DISABLE_WATCH: process.env.CSTAR_KERNEL_DISABLE_WATCH ?? '1',
            CSTAR_PROJECT_ROOT: process.env.CSTAR_PROJECT_ROOT ?? ROOT,
            CSTAR_WORKSPACE_ROOT: process.env.CSTAR_WORKSPACE_ROOT ?? ROOT,
        }
    });

    // Pipe socket to child stdin
    socket.pipe(child.stdin);

    // Log all incoming JSON-RPC calls
    let requestBuffer = '';
    socket.on('data', (chunk) => {
        requestBuffer += chunk.toString('utf8');
        let nl = requestBuffer.indexOf('\n');
        while (nl !== -1) {
            const line = requestBuffer.slice(0, nl).trim();
            requestBuffer = requestBuffer.slice(nl + 1);
            if (line) {
                try {
                    const msg = JSON.parse(line);
                    if (msg && msg.method) {
                        const method = msg.method;
                        const id = msg.id;
                        let extra = '';
                        if (method === 'tools/call' && msg.params?.name) {
                            extra = ` tool=${msg.params.name}`;
                        } else if (method === 'initialize') {
                            extra = ` client=${msg.params?.clientInfo?.name ?? 'unknown'}`;
                        }
                        console.log(`[${new Date().toISOString()}] [daemon] [call] method=${method} id=${id}${extra}`);
                    }
                } catch (e) {
                    // Non-JSON or partial chunk
                }
            }
            nl = requestBuffer.indexOf('\n');
        }
    });

    // Pipe child stdout to socket
    child.stdout.pipe(socket);

    // Forward child stderr to process stderr for debugging
    child.stderr.on('data', (data) => {
        process.stderr.write(`[child-stderr] ${data}`);
    });

    socket.on('close', () => {
        console.log(`[${new Date().toISOString()}] [daemon] client socket closed, killing child`);
        child.kill();
    });

    child.on('exit', (code) => {
        console.log(`[${new Date().toISOString()}] [daemon] child exited with code ${code}`);
        socket.destroy();
    });

    socket.on('error', (err) => {
        console.error(`[${new Date().toISOString()}] [daemon] socket error:`, err);
        child.kill();
    });
});

server.listen(PORT, HOST, () => {
    console.log(`[${new Date().toISOString()}] [daemon] CStar MCP TCP Daemon listening on ${HOST}:${PORT}`);
});
